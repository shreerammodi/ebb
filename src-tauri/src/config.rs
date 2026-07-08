//! Plain-text config file sync (desktop).
//!
//! The Settings the JS layer manages are mirrored to a human-editable
//! `config.toml` under the user's config dir. This module is a dumb file layer:
//! it resolves the path, reads/writes the file, and watches it for external
//! edits. It owns TOML *syntax* (converting to JSON for the frontend on read,
//! and merging JSON values into the existing document on write so comments and
//! formatting survive) but knows nothing about what any setting *means* - the
//! frontend validates and applies the values.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{RecursiveMode, Watcher};
use serde_json::Value as Json;
use tauri::{AppHandle, Emitter, Manager, State};
use toml_edit::{DocumentMut, Item, Table, Value as Toml};

/// Shared "last bytes seen on disk", used both to suppress the echo of our own
/// writes and to dedupe repeated watcher events for identical content.
type LastSeen = Arc<Mutex<Option<Vec<u8>>>>;

/// Managed state backing the `read_config`/`write_config` commands.
pub struct ConfigState {
    path: PathBuf,
    last: LastSeen,
}

/// `$XDG_CONFIG_HOME/ebb/config.toml`, else the platform-native config dir.
///
/// Honors `XDG_CONFIG_HOME` on any platform when set; otherwise `%APPDATA%\ebb`
/// on Windows and `~/.config/ebb` elsewhere.
fn config_path() -> Option<PathBuf> {
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return Some(PathBuf::from(xdg).join("ebb").join("config.toml"));
        }
    }
    #[cfg(windows)]
    {
        let appdata = std::env::var_os("APPDATA")?;
        Some(PathBuf::from(appdata).join("ebb").join("config.toml"))
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("HOME")?;
        Some(
            PathBuf::from(home)
                .join(".config")
                .join("ebb")
                .join("config.toml"),
        )
    }
}

// --- TOML <-> JSON -------------------------------------------------------------

fn parse_toml_to_json(text: &str) -> Result<Json, String> {
    toml_edit::de::from_str(text).map_err(|e| format!("{e}"))
}

// --- JSON -> document merge (comment-preserving) -------------------------------

fn json_scalar_to_toml(v: &Json) -> Option<Toml> {
    match v {
        Json::String(s) => Some(Toml::from(s.as_str())),
        Json::Bool(b) => Some(Toml::from(*b)),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(Toml::from(i))
            } else {
                n.as_f64().map(Toml::from)
            }
        }
        _ => None,
    }
}

fn set_scalar(table: &mut Table, key: &str, v: &Json) {
    let Some(mut new_val) = json_scalar_to_toml(v) else {
        return;
    };
    // For an existing key, replace only the value in place - never re-insert the
    // key, or its leading comment (stored on the key's decor) is dropped. Copy
    // the old value's decor too so an inline trailing comment survives.
    if let Some(item) = table.get_mut(key) {
        if let Some(existing) = item.as_value() {
            *new_val.decor_mut() = existing.decor().clone();
        }
        *item = Item::Value(new_val);
    } else {
        table.insert(key, Item::Value(new_val));
    }
}

/// Merges `obj` into `table`. Scalars are set (JSON `null` removes the key). A
/// nested object is treated as an authoritative table: entries it omits are
/// removed, so a keymap override dropped in the app disappears from the file.
/// The top-level call is non-authoritative, so comments and any keys the user
/// added by hand outside the known set are left untouched.
fn merge_into(table: &mut Table, obj: &serde_json::Map<String, Json>, authoritative: bool) {
    for (key, val) in obj {
        match val {
            Json::Null => {
                table.remove(key);
            }
            Json::Object(inner) => {
                if !table.get(key).map(Item::is_table).unwrap_or(false) {
                    table.insert(key, Item::Table(Table::new()));
                }
                let sub = table.get_mut(key).unwrap().as_table_mut().unwrap();
                merge_into(sub, inner, true);
            }
            _ => set_scalar(table, key, val),
        }
    }
    if authoritative {
        let keep: HashSet<&str> = obj.keys().map(String::as_str).collect();
        let stale: Vec<String> = table
            .iter()
            .map(|(k, _)| k.to_string())
            .filter(|k| !keep.contains(k.as_str()))
            .collect();
        for k in stale {
            table.remove(&k);
        }
    }
}

/// Renders the config JSON into TOML, merging into `existing` when present so
/// the user's comments and layout are preserved.
fn render_toml(existing: Option<&str>, config: &Json) -> Result<String, String> {
    let mut doc: DocumentMut = match existing {
        Some(text) => text.parse().map_err(|e| format!("{e}"))?,
        None => DocumentMut::new(),
    };
    if let Json::Object(obj) = config {
        merge_into(doc.as_table_mut(), obj, false);
    }
    Ok(doc.to_string())
}

// --- Commands ------------------------------------------------------------------

#[tauri::command]
pub fn read_config(state: State<'_, ConfigState>) -> Result<Option<Json>, String> {
    match std::fs::read_to_string(&state.path) {
        Ok(text) => Ok(Some(parse_toml_to_json(&text)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{e}")),
    }
}

#[tauri::command]
pub fn write_config(state: State<'_, ConfigState>, config: Json) -> Result<(), String> {
    let existing = std::fs::read_to_string(&state.path).ok();
    let rendered = render_toml(existing.as_deref(), &config)?;
    let bytes = rendered.into_bytes();

    // Record our own write BEFORE touching disk so the watcher event it triggers
    // compares equal and is suppressed.
    *state.last.lock().unwrap() = Some(bytes.clone());

    if let Some(dir) = state.path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{e}"))?;
    }
    std::fs::write(&state.path, &bytes).map_err(|e| format!("{e}"))
}

// --- Watcher -------------------------------------------------------------------

/// Reads the file after a change and emits `config:changed` unless the content
/// matches what we last saw (our own write, or a duplicate event). A malformed
/// file is skipped without updating `last`, so the next good save re-emits.
fn on_file_event(app: &AppHandle, path: &Path, last: &LastSeen) {
    let Ok(text) = std::fs::read_to_string(path) else {
        return;
    };
    let bytes = text.clone().into_bytes();
    {
        let guard = last.lock().unwrap();
        if guard.as_deref() == Some(bytes.as_slice()) {
            return;
        }
    }
    let Ok(json) = parse_toml_to_json(&text) else {
        return;
    };
    *last.lock().unwrap() = Some(bytes);
    let _ = app.emit("config:changed", json);
}

/// Sets up the config file and its watcher. Silently no-ops if the config dir
/// can't be resolved (e.g. no HOME) - config sync is a convenience, never fatal.
pub fn init(app: &AppHandle) {
    let Some(path) = config_path() else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }

    let last: LastSeen = Arc::new(Mutex::new(None));
    app.manage(ConfigState {
        path: path.clone(),
        last: last.clone(),
    });

    // Watch the parent dir (not the file), so atomic-rename saves - which
    // replace the inode - are still seen.
    let Some(dir) = path.parent().map(Path::to_path_buf) else {
        return;
    };
    let app_handle = app.clone();
    let watch_path = path.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if event.paths.iter().any(|p| *p == watch_path) {
                on_file_event(&app_handle, &watch_path, &last);
            }
        }
    });
    if let Ok(mut watcher) = watcher {
        if watcher.watch(&dir, RecursiveMode::NonRecursive).is_ok() {
            // ponytail: the watcher must live for the whole process; forgetting
            // it is the simplest way to keep it alive without threading a handle
            // through app state we never read again.
            std::mem::forget(watcher);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_preserves_comments_and_only_changes_the_value() {
        let existing = "# top note\ntheme = \"light\"  # inline\n";
        let out = render_toml(Some(existing), &json!({ "theme": "dark" })).unwrap();
        assert!(out.contains("# top note"), "leading comment kept: {out}");
        assert!(out.contains("# inline"), "inline comment kept: {out}");
        assert!(out.contains("theme = \"dark\""), "value updated: {out}");
    }

    #[test]
    fn null_removes_a_key() {
        let existing = "aff_color = \"#1d4ed8\"\ntheme = \"dark\"\n";
        let out = render_toml(Some(existing), &json!({ "aff_color": null })).unwrap();
        assert!(!out.contains("aff_color"), "reset color removed: {out}");
        assert!(out.contains("theme = \"dark\""));
    }

    #[test]
    fn keymap_table_reconciles_membership_keeping_comments() {
        let existing = "[keymap]\n# my binding\ngridGoTop = \"g g\"\nold = \"x\"\n";
        let out =
            render_toml(Some(existing), &json!({ "keymap": { "gridGoTop": "g g" } })).unwrap();
        assert!(out.contains("# my binding"), "entry comment kept: {out}");
        assert!(out.contains("gridGoTop"));
        assert!(!out.contains("old ="), "dropped override removed: {out}");
    }

    #[test]
    fn unknown_top_level_keys_are_preserved() {
        let existing = "# personal\nmy_custom = 3\ntheme = \"light\"\n";
        let out = render_toml(Some(existing), &json!({ "theme": "dark" })).unwrap();
        assert!(out.contains("my_custom = 3"), "unknown key kept: {out}");
        assert!(out.contains("# personal"));
    }

    #[test]
    fn round_trips_scalars_and_tables_to_json() {
        let json =
            parse_toml_to_json("theme = \"dark\"\n[update]\nauto_check_enabled = true\n").unwrap();
        assert_eq!(json["theme"], "dark");
        assert_eq!(json["update"]["auto_check_enabled"], true);
    }
}
