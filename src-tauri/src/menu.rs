//! Ebb's native menu.
//!
//! ## Menu design
//!
//! Ebb is keyboard-first and the JS keymap in `src/lib/keymap` is the single
//! source of truth for every app binding. The menu mirrors those commands so
//! they are reachable by mouse, and carries real accelerators so its chords
//! land in the OS's reserved shortcut column like any native app.
//!
//! Every app command item carries its JS `CommandId` as the menu id. Both a
//! click and the accelerator emit a `menu:command` event that the frontend
//! routes through `dispatchMenuCommand` (see `useDesktopMenu`). An
//! accelerator is consumed by the OS *before* the webview's keydown fires,
//! so chords the OS reserves for text editing (Meta+Z undo, Shift+Meta+Z
//! redo, Meta+Backspace delete-to-line-start, Meta+A select-all) are
//! re-dispatched in JS: with a text field focused they perform the native
//! editing action; otherwise they run the app command.
//!
//! Items whose chords cannot be accelerators show no shortcut and work by
//! click only: bare printables (`]`, `[`, `?`) would fire while typing.
//!
//! Cut/Copy/Paste stay real `PredefinedMenuItem`s: macOS WKWebView routes an
//! editing chord into the focused text field only when a menu item carries
//! that accelerator. Select All is a custom item (id `selectAll`) with the
//! same accelerator treatment; its JS handler selects the focused field's
//! contents and no-ops in grid focus.

use std::collections::HashMap;
use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Menu item id for the single deliberate-exit path.
pub const QUIT_ID: &str = "quit";

/// Menu item id for Select All; handled in JS (not a CommandId).
pub const SELECT_ALL_ID: &str = "selectAll";

/// Every platform words this differently, and using the wrong word is the kind
/// of detail that makes an app feel ported rather than native.
#[cfg(target_os = "macos")]
const REVEAL_LABEL: &str = "Show in Finder";
#[cfg(target_os = "windows")]
const REVEAL_LABEL: &str = "Show in Explorer";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const REVEAL_LABEL: &str = "Show in File Manager";

/// Builds the application menu. `accels` maps a CommandId to its current
/// accelerator (empty string = click-only); each item's preset accelerator
/// applies until the frontend syncs the effective keymap via rebuild_menu.
pub fn build<R: Runtime>(
    app: &AppHandle<R>,
    accels: &HashMap<String, String>,
) -> tauri::Result<Menu<R>> {
    // A clickable command item: its id is a JS CommandId, emitted on click
    // and via the real accelerator. An empty accel means click-only.
    let cmd = |id: &str, label: &str, default: &str| -> tauri::Result<_> {
        let accel = accels.get(id).map(String::as_str).unwrap_or(default);
        let mut item = MenuItemBuilder::new(label).id(id);
        if !accel.is_empty() {
            item = item.accelerator(accel);
        }
        item.build(app)
    };

    // Custom Quit so we own the only deliberate exit (handled in lib.rs via
    // app.exit). Meta+Q is not an app binding, so the accelerator is safe.
    let quit = MenuItemBuilder::new("Quit ebb")
        .id(QUIT_ID)
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    // macOS application menu (the bold first menu). On other platforms this
    // simply contributes a leading "ebb" submenu, which is harmless.
    let app_menu = SubmenuBuilder::new(app, "ebb")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About ebb"),
            Some(AboutMetadata::default()),
        )?)
        .separator()
        .item(&cmd("settings.open", "Settings", "CmdOrCtrl+Comma")?)
        .separator()
        // Hide / Minimize keep their OS-standard Meta+H / Meta+M accelerators;
        // macOS only routes those chords when a menu item carries them. The
        // app's pane-focus chords therefore live on Alt+h / Alt+l.
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&quit)
        .build()?;

    // File: the document commands first, then the sheet-structure ones that
    // act inside the open flow. The Settings duplicate here is click-only; the
    // app-menu item owns the accelerator (two items with the same
    // key-equivalent would race).
    //
    // Open and New Flow both carry no accelerator: CmdOrCtrl+O is Insert
    // Cell in the editor, and CmdOrCtrl+N is New Window (see the Window
    // submenu below) - both are commands a debater uses mid-speech or
    // reaches for reflexively, so they outrank a between-rounds action. The
    // start screen binds bare "o" and "n" instead.
    //
    // Join sits with them because it is the third way a flow arrives on
    // screen, and the only one a guest reaches with nothing open: the
    // sidebar's sharing controls need a round, and the palette only mounts
    // on the flow screen. Click-only, since the collaboration commands carry
    // no chord at all.
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&cmd("flow.new", "New Flow", "")?)
        .item(&cmd("flow.open", "Open Flow...", "")?)
        .item(&cmd("collab.join", "Join Round...", "")?)
        .separator()
        .item(&cmd("flow.save", "Save", "CmdOrCtrl+S")?)
        .item(&cmd("flow.saveAs", "Save As...", "CmdOrCtrl+Shift+S")?)
        .item(&cmd("flow.reveal", REVEAL_LABEL, "")?)
        .item(&cmd("flow.close", "Close Flow", "")?)
        .separator()
        .item(&cmd("sheet.newAff", "New Aff Sheet", "CmdOrCtrl+Shift+A")?)
        .item(&cmd("sheet.newNeg", "New Neg Sheet", "CmdOrCtrl+Shift+N")?)
        .item(&cmd("sheet.rename", "Rename Sheet", "CmdOrCtrl+R")?)
        .separator()
        .item(&cmd("info.open", "Round Info", "")?)
        .item(
            &MenuItemBuilder::new("Settings")
                .id("settings.open")
                .build(app)?,
        )
        .build()?;

    // Edit: Undo/Redo/Delete Row are focus-dependent and re-dispatched in JS
    // (see module docs). Cut/Copy/Paste stay predefined items.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&cmd("edit.undo", "Undo", "CmdOrCtrl+Z")?)
        .item(&cmd("edit.redo", "Redo", "CmdOrCtrl+Shift+Z")?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&cmd(SELECT_ALL_ID, "Select All", "CmdOrCtrl+A")?)
        .separator()
        .item(&cmd("format.toggleBold", "Bold", "CmdOrCtrl+B")?)
        .item(&cmd(
            "format.toggleHighlight",
            "Highlight",
            "CmdOrCtrl+Shift+H",
        )?)
        .item(&cmd("format.toggleCard", "Card", "CmdOrCtrl+T")?)
        .item(&cmd("format.toggleGroup", "Group", "CmdOrCtrl+G")?)
        .item(&cmd("format.toggleKicked", "Kicked", "CmdOrCtrl+K")?)
        .separator()
        .item(&cmd("row.insertAbove", "Insert Row", "CmdOrCtrl+Shift+O")?)
        .item(&cmd("cell.insert", "Insert Cell", "CmdOrCtrl+O")?)
        .item(&cmd("row.delete", "Delete Row", "CmdOrCtrl+Backspace")?)
        .build()?;

    // View: navigation and panel toggles. Every accelerator here is the
    // keymap's, looked up per command; the strings below are only the
    // fallback for a command the map does not name.
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&cmd("sheet.next", "Next Sheet", "CmdOrCtrl+BracketRight")?)
        .item(&cmd("sheet.prev", "Previous Sheet", "CmdOrCtrl+BracketLeft")?)
        .item(&cmd(
            "sheet.moveUp",
            "Move Sheet Up",
            "CmdOrCtrl+Shift+BracketLeft",
        )?)
        .item(&cmd(
            "sheet.moveDown",
            "Move Sheet Down",
            "CmdOrCtrl+Shift+BracketRight",
        )?)
        .separator()
        .item(&cmd("sheet.quickSwitch", "Search Cells", "CmdOrCtrl+P")?)
        .item(&cmd(
            "palette.open",
            "Command Palette",
            "CmdOrCtrl+Shift+P",
        )?)
        .separator()
        .item(&cmd(
            "sidebar.toggle",
            "Toggle Sidebar",
            "CmdOrCtrl+Backslash",
        )?)
        .item(&cmd("rfd.toggle", "Toggle RFD", "CmdOrCtrl+J")?)
        .item(&cmd(
            "view.decision",
            "Toggle Decision View",
            "CmdOrCtrl+Shift+J",
        )?)
        .build()?;

    // Window: New Window first, matching the platform convention; Close
    // Window is ours rather than the predefined item so it runs through the
    // flush handshake and follows the keymap. The rest are native window
    // commands whose accelerators the OS owns.
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&cmd("window.new", "New Window", "CmdOrCtrl+N")?)
        .item(&cmd("window.close", "Close Window", "CmdOrCtrl+W")?)
        .separator()
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .build()?;

    // Help: opens the in-app keybindings guide (bound to bare `?`).
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&cmd("help.open", "Keyboard Shortcuts", "")?)
        .build()?;

    tauri::menu::MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

/// Rebuilds the menu with the frontend's effective-keymap accelerators.
/// Menu mutation must happen on the main thread on macOS; failures are
/// logged rather than surfaced because a stale menu is cosmetic, not fatal.
#[tauri::command]
pub fn rebuild_menu<R: Runtime>(app: AppHandle<R>, accels: HashMap<String, String>) {
    let handle = app.clone();
    let result = app.run_on_main_thread(move || match build(&handle, &accels) {
        Ok(menu) => {
            if let Err(e) = handle.set_menu(menu) {
                eprintln!("rebuild_menu: set_menu failed: {e}");
            }
        }
        Err(e) => eprintln!("rebuild_menu: build failed: {e}"),
    });
    if let Err(e) = result {
        eprintln!("rebuild_menu: main-thread dispatch failed: {e}");
    }
}
