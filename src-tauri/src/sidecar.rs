//! Collaboration sidecars: one file per round, beside the config.
//!
//! The webview names a round, never a path. Everything about where the file
//! lands is decided here, the same way the recents list is, so a compromised
//! or buggy frontend cannot steer a write anywhere it likes. A round id is a
//! caller-supplied path fragment, so it is validated against a plain-name
//! pattern before it is joined to anything. No path argument this shell takes
//! is trusted for where it came from: a flow path arrives from argv, a query
//! string, or the recents file as readily as from a picker, and a peer can
//! steer the name a joined round is created under.
//!
//! A sidecar holds round content that already sits unprotected in the user's
//! flows directory, so it gets no permission hardening; it is not a credential
//! the way the bridge's session token is.

use std::path::{Path, PathBuf};

use crate::config::config_dir;
use crate::flowfile::write_atomic;

/// `round_lk3x9_4f2.json`, or nothing when the id is not a plain name.
///
/// A dot is refused along with every separator: nothing legitimate needs one,
/// and refusing it takes `..` out of play by construction rather than by a
/// special case a later edit could drop.
fn sidecar_name(round_id: &str) -> Option<String> {
    if round_id.is_empty() || round_id.len() > 64 {
        return None;
    }
    if !round_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return None;
    }
    Some(format!("{round_id}.json"))
}

/// The base directory is a parameter so the whole path rule is testable
/// without touching the environment the rest of the process shares.
fn sidecar_path_in(base: &Path, round_id: &str) -> Result<PathBuf, String> {
    let name = sidecar_name(round_id).ok_or("Not a round id")?;
    Ok(base.join("sidecars").join(name))
}

fn read_sidecar_in(base: &Path, round_id: &str) -> Result<Option<String>, String> {
    let path = sidecar_path_in(base, round_id)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read the sidecar: {e}")),
    }
}

fn write_sidecar_in(base: &Path, round_id: &str, contents: &str) -> Result<(), String> {
    write_atomic(&sidecar_path_in(base, round_id)?, contents.as_bytes())
}

fn base_dir() -> Result<PathBuf, String> {
    config_dir().ok_or_else(|| "Could not locate your config directory".to_string())
}

#[tauri::command]
pub fn read_sidecar(round_id: String) -> Result<Option<String>, String> {
    read_sidecar_in(&base_dir()?, &round_id)
}

#[tauri::command]
pub fn write_sidecar(round_id: String, contents: String) -> Result<(), String> {
    write_sidecar_in(&base_dir()?, &round_id, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ebb-sidecar-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_round_id_that_is_not_a_plain_name_is_refused() {
        assert!(sidecar_name("round_lk3x9_4f2").is_some());
        assert!(sidecar_name("Round-9").is_some());
        assert!(sidecar_name("..").is_none());
        assert!(sidecar_name("../../etc/passwd").is_none());
        assert!(sidecar_name("a/b").is_none());
        assert!(sidecar_name("a\\b").is_none());
        assert!(sidecar_name("/absolute").is_none());
        assert!(sidecar_name("").is_none());
        assert!(sidecar_name(&"x".repeat(65)).is_none());
        assert!(sidecar_name("round.9").is_none());
    }

    #[test]
    fn a_path_stays_under_the_base_directory() {
        let base = Path::new("/tmp/ebb-config");
        let path = sidecar_path_in(base, "round_a").unwrap();
        assert_eq!(path, base.join("sidecars").join("round_a.json"));
        assert!(sidecar_path_in(base, "../escape").is_err());
    }

    #[test]
    fn a_write_round_trips_and_a_missing_round_reads_as_absent() {
        let base = tmpdir("roundtrip");
        assert_eq!(read_sidecar_in(&base, "round_a").unwrap(), None);
        write_sidecar_in(&base, "round_a", "{\"v\":1}").unwrap();
        assert_eq!(
            read_sidecar_in(&base, "round_a").unwrap(),
            Some("{\"v\":1}".to_string())
        );
    }

    #[test]
    fn a_refused_round_id_never_touches_the_filesystem() {
        let base = tmpdir("refuse");
        assert!(write_sidecar_in(&base, "../escape", "x").is_err());
        assert!(read_sidecar_in(&base, "../escape").is_err());
        assert!(
            !base.join("sidecars").exists(),
            "no directory was created for a refused id"
        );
    }

    #[test]
    fn a_second_write_replaces_the_first_whole() {
        let base = tmpdir("replace");
        write_sidecar_in(&base, "round_a", "long original contents").unwrap();
        write_sidecar_in(&base, "round_a", "short").unwrap();
        assert_eq!(
            read_sidecar_in(&base, "round_a").unwrap(),
            Some("short".into())
        );
    }

    #[test]
    fn one_round_never_reads_another_rounds_sidecar() {
        let base = tmpdir("isolation");
        write_sidecar_in(&base, "round_a", "mine").unwrap();
        assert_eq!(read_sidecar_in(&base, "round_b").unwrap(), None);
    }
}
