//! Dragging the open flow out of ebb (desktop).
//!
//! A debater sending a round to a partner drags its title into Messages or
//! Mail. A webview drag cannot carry a real file to another app, so the drag is
//! started natively here. The path arrives from the webview like every path in
//! `flowfile.rs`, so it buys no trust: only an existing `.ebb` file may leave,
//! and always as a copy, never a move.

use std::path::{Path, PathBuf};

use tauri::{Runtime, WebviewWindow};

/// The drag preview: the app icon, so the file reads as an ebb flow in flight.
const ICON: &[u8] = include_bytes!("../icons/64x64.png");

/// Resolves the path to drag, refusing anything that is not an existing flow.
fn flow_to_drag(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err(format!("{} is not an absolute path", path.display()));
    }
    let real = path
        .canonicalize()
        .map_err(|e| format!("Could not find {}: {e}", path.display()))?;
    let is_flow = real
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("ebb"));
    if !is_flow || !real.is_file() {
        return Err(format!("{} is not a flow", path.display()));
    }
    Ok(without_verbatim_prefix(real))
}

/// On Windows `canonicalize` answers with a `\\?\` path, which some drop
/// targets refuse to accept from a file drag. The plain spelling names the
/// same file.
fn without_verbatim_prefix(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

/// Starts an OS drag of the flow at `path` from this window. Resolves once the
/// drag has begun; where it lands is the OS's business.
#[tauri::command]
pub async fn drag_flow_file<R: Runtime>(
    window: WebviewWindow<R>,
    path: String,
) -> Result<(), String> {
    let file = flow_to_drag(&path)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let target = window.clone();
    // AppKit and GTK both insist the drag starts on the UI thread.
    window
        .run_on_main_thread(move || {
            #[cfg(target_os = "linux")]
            let handle = target.gtk_window();
            #[cfg(not(target_os = "linux"))]
            let handle = tauri::Result::Ok(target);
            let started = handle.map_err(|e| e.to_string()).and_then(|w| {
                drag::start_drag(
                    &w,
                    drag::DragItem::Files(vec![file]),
                    drag::Image::Raw(ICON.to_vec()),
                    |_, _| {},
                    drag::Options::default(),
                )
                .map_err(|e| e.to_string())
            });
            let _ = tx.send(started);
        })
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn a_verbatim_path_is_handed_over_in_its_plain_spelling() {
        let plain = |p: &str| without_verbatim_prefix(PathBuf::from(p));
        assert_eq!(plain(r"\\?\C:\f\a.ebb"), PathBuf::from(r"C:\f\a.ebb"));
        assert_eq!(
            plain(r"\\?\UNC\srv\share\a.ebb"),
            PathBuf::from(r"\\srv\share\a.ebb")
        );
        assert_eq!(plain("/home/a.ebb"), PathBuf::from("/home/a.ebb"));
    }

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ebb-dragout-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn offers_an_existing_flow() {
        let dir = tmpdir("ok");
        let path = dir.join("Round 1.EBB");
        fs::write(&path, "{}").unwrap();

        let got = flow_to_drag(&path.to_string_lossy()).unwrap();

        assert_eq!(got, path.canonicalize().unwrap());
    }

    #[test]
    fn refuses_anything_that_is_not_a_flow() {
        let dir = tmpdir("refuse");
        let other = dir.join("notes.txt");
        fs::write(&other, "secret").unwrap();
        let folder = dir.join("folder.ebb");
        fs::create_dir_all(&folder).unwrap();

        for path in [
            other.to_string_lossy().into_owned(),
            folder.to_string_lossy().into_owned(),
            dir.join("gone.ebb").to_string_lossy().into_owned(),
            "relative.ebb".to_string(),
        ] {
            assert!(flow_to_drag(&path).is_err(), "{path} should be refused");
        }
    }

    /// A link named like a flow cannot smuggle out the file it points at.
    #[cfg(unix)]
    #[test]
    fn refuses_a_flow_named_link_to_another_file() {
        let dir = tmpdir("link");
        let target = dir.join("secret.txt");
        fs::write(&target, "secret").unwrap();
        let link = dir.join("round.ebb");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        assert!(flow_to_drag(&link.to_string_lossy()).is_err());
    }
}
