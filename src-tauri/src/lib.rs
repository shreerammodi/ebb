//! Ebb desktop shell.
//!
//! The shell stays deliberately thin: all app logic lives in the React
//! frontend (the same `src/` that powers the web build). Rust owns only window
//! creation, the native menu, lifecycle guards, and (later) the updater.

mod bridge;
mod collab;
mod config;
mod export;
mod flowfile;
mod menu;
mod pairing;
mod shutdown;
mod sidecar;
mod windows;

use tauri::Manager;

/// `[os, arch]` of the running binary, e.g. `["macos", "aarch64"]`. The webview
/// user agent can't be trusted for either (macOS reports "Intel" on Apple
/// Silicon), so the values come from the compiled target.
#[tauri::command]
fn system_info() -> [&'static str; 2] {
    [std::env::consts::OS, std::env::consts::ARCH]
}

/// Opens one window per requested flow path, or - if none were requested -
/// focuses whatever window is already frontmost, falling back to a fresh
/// dashboard if none exists. Shared by a second launch's forwarded argv and
/// macOS's `RunEvent::Opened`.
///
/// macOS delivers a double-clicked file before `setup()` runs, so an open
/// that lands that early is only queued; setup() drains it and builds the one
/// window it asked for.
fn handle_open<R: tauri::Runtime>(app: &tauri::AppHandle<R>, paths: Vec<String>) {
    if windows::queue_launch_opens(&paths) {
        return;
    }
    if paths.is_empty() {
        match windows::target_window(app) {
            Some(w) => {
                let _ = w.set_focus();
            }
            None => {
                let _ = windows::open_dashboard(app);
            }
        }
        return;
    }
    for path in paths {
        windows::adopt_or_open(app, &path);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Must precede every other plugin. A double-clicked .ebb on Windows or
    // Linux launches a second process; this hands its argv to the running
    // one so two copies never autosave over the same file. Every requested
    // path opens its own new window, same as macOS's RunEvent::Opened below.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        handle_open(app, flowfile::flow_paths_in(&argv));
    }));

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(collab::CollabState::default())
        .setup(|app| {
            // Signed updater + relaunch (desktop only). Policy (when to
            // download, install only on user confirmation) lives in the JS
            // layer; these plugins just expose the verified
            // check/download/install/relaunch primitives it drives.
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

            // Loopback endpoint CardMirror sends extracted cards to, and the
            // broker for our own outbound calls (desktop only; see
            // `bridge.rs`). A failed bind costs the integration, not the app.
            #[cfg(desktop)]
            bridge::start(app.handle());

            // Install the native menu; accelerators follow the JS keymap via
            // rebuild_menu (see menu.rs).
            let handle = app.handle();
            let app_menu = menu::build(handle, &std::collections::HashMap::new())?;
            app.set_menu(app_menu)?;

            // A cold launch with a .ebb argument (a double-click, or "Open
            // With") opens straight onto that flow instead of the dashboard.
            // Windows and Linux carry it in argv; macOS delivers it as
            // RunEvent::Opened below, which lands before this hook runs and
            // is queued for exactly this drain. A launch that asked for
            // nothing gets the dashboard, marked adoptable in case an open
            // event turns out to arrive after all (see windows.rs).
            let argv = std::env::args().collect::<Vec<_>>();
            let paths = windows::take_launch_opens(flowfile::flow_paths_in(&argv));
            if paths.is_empty() {
                let dashboard = windows::open_dashboard(handle)?;
                windows::mark_bootstrap(dashboard.label());
            } else {
                for path in paths {
                    windows::open_flow(handle, &path)?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_reply,
            bridge::cardmirror_insert,
            bridge::cardmirror_jump,
            collab::collab_claim,
            collab::collab_close,
            collab::collab_dial,
            collab::collab_endpoint_id,
            collab::collab_pair_code,
            collab::collab_pair_start,
            collab::collab_pair_stop,
            collab::collab_pair_target,
            collab::collab_relay_url,
            collab::collab_send,
            collab::collab_start,
            collab::collab_stop,
            collab::machine_name,
            config::read_config,
            config::write_config,
            export::write_export_file,
            flowfile::create_flow_file,
            flowfile::flow_paths,
            flowfile::read_flow_file,
            flowfile::read_recents,
            flowfile::write_flow_file,
            flowfile::write_recents,
            menu::rebuild_menu,
            sidecar::read_sidecar,
            sidecar::write_sidecar,
            shutdown::finish_quit,
            system_info,
            windows::close_window,
            windows::new_window,
            windows::report_open_path
        ])
        // Quit and every window's close control both run through the flush
        // handshake in shutdown.rs rather than exiting or closing on the
        // spot, so a debounced edit is never left behind in memory. Every
        // other menu item carries a JS CommandId, which we hand to the
        // window the user is looking at to run.
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if id == menu::QUIT_ID {
                shutdown::request_all(app);
            } else {
                let _ = windows::emit_target(app, "menu:command", id.to_string());
            }
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Focused(true) => windows::note_focus(window),
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let label = window.label();
                // Once a flush has been asked for, the follow-up close/exit
                // must be allowed through or the window could never close.
                if shutdown::in_progress(label) {
                    return;
                }
                api.prevent_close();
                shutdown::request_close(window.app_handle(), label);
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while running Ebb")
        // The session handshake advertises a port that dies with the process,
        // so it has to go on the way out; the identity file stays.
        .run(|app, event| match event {
            tauri::RunEvent::Exit => bridge::remove_session(),
            // macOS "Open With" and double-click, at launch and while
            // already running. Cold launch is instead handled in setup()
            // above, since macOS delivers a launch argument here too, after
            // the window array (now empty) would otherwise have been built.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let paths = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                handle_open(app, paths);
            }
            _ => {}
        });
}
