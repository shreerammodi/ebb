//! Ebb desktop shell.
//!
//! The shell stays deliberately thin: all app logic lives in the React
//! frontend (the same `src/` that powers the web build). Rust owns only window
//! creation, the native menu, lifecycle guards, and (later) the updater.

mod menu;

use tauri::WindowEvent;

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

            // Install the native menu (display-only; see `menu.rs`).
            let handle = app.handle();
            let app_menu = menu::build(handle)?;
            app.set_menu(app_menu)?;
            Ok(())
        })
        // Quit is the single deliberate exit. The custom menu item routes here
        // and exits directly, bypassing the close guard below.
        .on_menu_event(|app, event| {
            if event.id().0.as_str() == menu::QUIT_ID {
                app.exit(0);
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
