//! Recovery copies of open flows, beside the config.
//!
//! Every autosave writes the round here before it writes the `.ebb`, and the
//! copy is removed once the `.ebb` lands. A copy that survives is a round the
//! flow file never received: a crash between the two writes, or a flows
//! folder the OS would not let ebb write - Windows' Controlled Folder Access
//! guards Documents, where the flows folder lives by default, but not the
//! config directory. Opening the flow again restores it from here.
//!
//! The copy is written in place rather than renamed over, because the rename
//! is the step a scanner holding the file breaks. A crash mid-write leaves a
//! torn copy, which the frontend fails to parse and ignores in favor of the
//! `.ebb`, so in-place costs at most the one save it was carrying.
//!
//! The webview names a flow by its path, but the path never becomes part of a
//! filesystem path here: it is hashed, so no caller-supplied string can steer
//! where the copy lands.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::config::config_dir;
use crate::flowfile::{retry_while, windows_lock};

fn swap_path_in(base: &Path, flow_path: &str) -> PathBuf {
    let digest = Sha256::digest(flow_path.as_bytes());
    let name: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    base.join("swap").join(format!("{name}.ebb"))
}

fn read_swap_in(base: &Path, flow_path: &str) -> Result<Option<String>, String> {
    match fs::read_to_string(swap_path_in(base, flow_path)) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read the recovery copy: {e}")),
    }
}

fn write_swap_in(base: &Path, flow_path: &str, contents: &str) -> Result<(), String> {
    let path = swap_path_in(base, flow_path);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    retry_while(windows_lock, || {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()
    })
    .map_err(|e| format!("Could not write the recovery copy: {e}"))
}

fn clear_swap_in(base: &Path, flow_path: &str) -> Result<(), String> {
    match fs::remove_file(swap_path_in(base, flow_path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not remove the recovery copy: {e}")),
    }
}

fn base_dir() -> Result<PathBuf, String> {
    config_dir().ok_or_else(|| "Could not locate your config directory".to_string())
}

#[tauri::command(async)]
pub fn read_swap(path: String) -> Result<Option<String>, String> {
    read_swap_in(&base_dir()?, &path)
}

#[tauri::command(async)]
pub fn write_swap(path: String, contents: String) -> Result<(), String> {
    write_swap_in(&base_dir()?, &path, &contents)
}

#[tauri::command(async)]
pub fn clear_swap(path: String) -> Result<(), String> {
    clear_swap_in(&base_dir()?, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ebb-swap-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_copy_round_trips_and_clears() {
        let base = tmpdir("roundtrip");
        assert_eq!(read_swap_in(&base, "/f/a.ebb").unwrap(), None);
        write_swap_in(&base, "/f/a.ebb", "longer first").unwrap();
        write_swap_in(&base, "/f/a.ebb", "second").unwrap();
        assert_eq!(
            read_swap_in(&base, "/f/a.ebb").unwrap().as_deref(),
            Some("second")
        );
        clear_swap_in(&base, "/f/a.ebb").unwrap();
        assert_eq!(read_swap_in(&base, "/f/a.ebb").unwrap(), None);
        clear_swap_in(&base, "/f/a.ebb").unwrap();
    }

    #[test]
    fn a_hostile_path_stays_inside_the_swap_dir() {
        let base = tmpdir("hostile");
        for p in ["../../etc/passwd", "/abs/x.ebb", "C:\\x.ebb", ""] {
            let path = swap_path_in(&base, p);
            assert_eq!(path.parent(), Some(base.join("swap").as_path()));
        }
        assert_ne!(swap_path_in(&base, "/a.ebb"), swap_path_in(&base, "/b.ebb"));
    }
}
