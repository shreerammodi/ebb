//! Ebb desktop shell.
//!
//! The shell stays deliberately thin: all app logic lives in the React
//! frontend (the same `src/` that powers the web build). Rust owns only window
//! creation, the native menu, lifecycle guards, and (later) the updater.

mod config;
mod menu;

use tauri::{Emitter, WindowEvent};

/// `[os, arch]` of the running binary, e.g. `["macos", "aarch64"]`. The webview
/// user agent can't be trusted for either (macOS reports "Intel" on Apple
/// Silicon), so the values come from the compiled target.
#[tauri::command]
fn system_info() -> [&'static str; 2] {
    [std::env::consts::OS, std::env::consts::ARCH]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Signed updater + relaunch (desktop only). Policy (blackout,
            // Tournament Mode, critical bypass) lives in the JS layer; these
            // plugins just expose the verified check/download/install/relaunch
            // primitives it drives.
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            // Mirror settings to a plain-text config file and watch it for
            // external edits (desktop only; see `config.rs`).
            #[cfg(desktop)]
            config::init(app.handle());

            // Install the native menu (display-only; see `menu.rs`).
            let handle = app.handle();
            let app_menu = menu::build(handle)?;
            app.set_menu(app_menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::read_config,
            config::write_config,
            system_info
        ])
        // Quit is the single deliberate exit; it routes here and exits directly,
        // bypassing the close guard below. Every other menu item carries a JS
        // CommandId, which we hand to the frontend to run (see useDesktopMenu).
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if id == menu::QUIT_ID {
                app.exit(0);
            } else {
                let _ = app.emit("menu:command", id.to_string());
            }
        })
        // Window lifecycle guard: neutralize destructive closes of the primary
        // window. `⌘W` and the red traffic-light button both raise
        // CloseRequested; we prevent it so a round can't be lost to an
        // accidental close. Continuous autosave already makes a real quit
        // (`⌘Q` → app.exit) non-destructive.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Ebb");
}
