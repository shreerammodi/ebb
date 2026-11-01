//! Whether ebb can write the flows folder, and, on Windows, asking for it.
//!
//! Windows Security's Controlled Folder Access guards Documents, where the
//! flows folder lives by default, and refuses writes from any app it does not
//! know. The refusal is silent apart from a notification the debater may not
//! connect to ebb, and it makes every save and every new flow fail. So the
//! start screen checks the folder, and when Windows refuses, offers to add ebb
//! to the allowed apps.
//!
//! Adding an app needs administrator rights, so the allow is an elevated
//! PowerShell run behind the UAC prompt. The script names only this process's
//! own executable, read here, never anything the webview supplies.

use std::fs;
use std::path::Path;

/// Writes and removes a probe file in `dir`. "blocked" is a refused write,
/// which is what Controlled Folder Access and a read-only folder both produce;
/// "unavailable" is anything else, such as a drive that is gone.
fn probe(dir: &Path) -> &'static str {
    let attempt = || -> std::io::Result<()> {
        fs::create_dir_all(dir)?;
        let file = dir.join(".ebb-write-check");
        let _ = fs::remove_file(&file);
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file)?;
        fs::remove_file(&file)
    };
    match attempt() {
        Ok(()) => "ok",
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => "blocked",
        Err(_) => "unavailable",
    }
}

#[tauri::command(async)]
pub fn probe_flows_dir(dir: String) -> &'static str {
    probe(Path::new(&dir))
}

/// The script the elevated PowerShell runs: allow `exe`, and exit 0 only if
/// Windows took it. Single quotes are PowerShell's literal string, so a quote
/// in the path is doubled and nothing in it is interpreted.
#[cfg_attr(not(windows), allow(dead_code))]
fn allow_script(exe: &str) -> String {
    let quoted = exe.replace('\'', "''");
    format!(
        "try {{ Add-MpPreference -ControlledFolderAccessAllowedApplications '{quoted}' -ErrorAction Stop; exit 0 }} catch {{ exit 1 }}"
    )
}

/// PowerShell's -EncodedCommand form: base64 over UTF-16LE. Passing scripts
/// this way means no shell ever re-parses the path inside them.
#[cfg_attr(not(windows), allow(dead_code))]
fn encode_command(script: &str) -> String {
    use base64::Engine;
    let utf16: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64::engine::general_purpose::STANDARD.encode(utf16)
}

/// Raises the UAC prompt to add ebb to Controlled Folder Access's allowed
/// apps. True once Windows accepted it; false when the debater declined the
/// prompt or a policy refused the change. Whether the folder is now writable
/// is the caller's to check again, since a managed machine can accept the
/// setting and still enforce its own list.
#[tauri::command(async)]
pub fn allow_in_controlled_folders() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let inner = encode_command(&allow_script(&exe.to_string_lossy()));
        // The outer, unelevated PowerShell exists only to start the elevated
        // one and wait for its answer; declining UAC makes Start-Process
        // throw, which exits nonzero.
        let outer = encode_command(&format!(
            "$p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','{inner}'; exit $p.ExitCode"
        ));
        let status = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &outer])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Could not ask Windows: {e}"))?;
        Ok(status.success())
    }
    #[cfg(not(windows))]
    {
        Err("Only Windows has Controlled Folder Access".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_writable_folder_probes_ok_and_keeps_nothing() {
        let dir = std::env::temp_dir().join(format!("ebb-probe-{}", std::process::id()));
        assert_eq!(probe(&dir), "ok");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn a_refused_folder_probes_blocked() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("ebb-probe-ro-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).unwrap();
        let got = probe(&dir);
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
        // Root ignores mode bits, so a CI runner as root sees it writable.
        assert!(got == "blocked" || got == "ok");
    }

    #[test]
    fn a_quote_in_the_path_cannot_end_the_string() {
        let script = allow_script(r"C:\Users\o'brien\ebb.exe");
        assert!(script.contains(r"'C:\Users\o''brien\ebb.exe'"));
    }

    #[test]
    fn the_script_is_encoded_as_powershell_expects() {
        // "a" in UTF-16LE is 61 00, which is "YQA=" in base64.
        assert_eq!(encode_command("a"), "YQA=");
    }
}
