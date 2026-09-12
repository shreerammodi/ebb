//! Exported files (desktop).
//!
//! An export leaves ebb's format behind: it is a workbook the debater files
//! wherever they like, so unlike a flow it is written once and never read
//! back. That is the whole command - a path and its bytes - and the path
//! comes from the native save panel in `saveDesktop.ts`. Being picker-derived
//! buys it no trust here, exactly as in `flowfile.rs`; what keeps this narrow
//! is that a write is all it can do.

use std::path::Path;

use crate::flowfile::write_atomic;

/// Write an export, replacing whatever the user chose to overwrite. The picker
/// has already asked about that, so a confirmed target is written without a
/// second opinion.
#[tauri::command]
pub fn write_export_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    write_atomic(Path::new(&path), &contents)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ebb-export-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_bytes_verbatim() {
        let dir = tmpdir("write");
        let path = dir.join("flow.xlsx");
        // A zip local file header: binary, and invalid UTF-8 in byte 4.
        let bytes = vec![0x50, 0x4b, 0x03, 0x04, 0xff, 0x00];

        write_export_file(path.to_string_lossy().into_owned(), bytes.clone()).unwrap();

        assert_eq!(fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn replaces_an_existing_export() {
        let dir = tmpdir("replace");
        let path = dir.join("flow.xlsx");
        fs::write(&path, b"old").unwrap();

        write_export_file(path.to_string_lossy().into_owned(), b"new".to_vec()).unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"new");
    }

    /// The frontend sends the bytes as a JSON number array, so the command's
    /// signature has to accept one: a shape mismatch here is invisible to a
    /// direct call and fatal at the only callsite there is.
    #[test]
    fn takes_the_payload_the_webview_sends() {
        let dir = tmpdir("ipc");
        let path = dir.join("round.xlsx");
        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![write_export_file])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        let res = tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "write_export_file".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(serde_json::json!({
                    "path": path.to_string_lossy(),
                    "contents": [0x50, 0x4b, 0x03, 0x04, 0xff],
                })),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        );

        assert!(res.is_ok(), "{res:?}");
        assert_eq!(fs::read(&path).unwrap(), vec![0x50, 0x4b, 0x03, 0x04, 0xff]);
    }
}
