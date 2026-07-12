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

use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Menu item id for the single deliberate-exit path.
pub const QUIT_ID: &str = "quit";

/// Menu item id for Select All; handled in JS (not a CommandId).
pub const SELECT_ALL_ID: &str = "selectAll";

/// Builds the application menu.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // A clickable command item: its id is a JS CommandId, emitted on click
    // and via the real accelerator. An empty accel means click-only.
    let cmd = |id: &str, label: &str, accel: &str| -> tauri::Result<_> {
        let mut item = MenuItemBuilder::new(label).id(id);
        if !accel.is_empty() {
            item = item.accelerator(accel);
        }
        item.build(app)
    };

    // Custom Quit so we own the only deliberate exit (handled in lib.rs via
    // app.exit). Meta+Q is not an app binding, so the accelerator is safe.
    let quit = MenuItemBuilder::new("Quit Ebb")
        .id(QUIT_ID)
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    // macOS application menu (the bold first menu). On other platforms this
    // simply contributes a leading "Ebb" submenu, which is harmless.
    let app_menu = SubmenuBuilder::new(app, "Ebb")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Ebb"),
            Some(AboutMetadata::default()),
        )?)
        .separator()
        .item(&cmd("settings.open", "Settings", "CmdOrCtrl+Comma")?)
        .separator()
        // No "Hide" item: its baked-in Meta+H accelerator would be consumed
        // by macOS before the webview's keydown, shadowing the app's Meta+h
        // (split.focusLeft). Users minimize with Meta+M instead. Hide Others /
        // Show All keep their own non-conflicting accelerators.
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&quit)
        .build()?;

    // File: sheet creation / structure commands. The Settings duplicate here
    // is click-only; the app-menu item owns the accelerator (two items with
    // the same key-equivalent would race).
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&cmd("sheet.newAff", "New Aff Sheet", "CmdOrCtrl+Shift+A")?)
        .item(&cmd("sheet.newNeg", "New Neg Sheet", "CmdOrCtrl+Shift+N")?)
        .item(&cmd("sheet.rename", "Rename Sheet", "CmdOrCtrl+R")?)
        .separator()
        .item(&cmd("info.open", "Round Info", "")?)
        .item(&cmd("settings.open", "Settings", "")?)
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
        .item(&cmd("format.toggleHighlight", "Highlight", "CmdOrCtrl+Shift+H")?)
        .item(&cmd("format.toggleCard", "Card", "CmdOrCtrl+T")?)
        .separator()
        .item(&cmd("row.insertAbove", "Insert Row", "CmdOrCtrl+Shift+O")?)
        .item(&cmd("cell.insert", "Insert Cell", "CmdOrCtrl+O")?)
        .item(&cmd("row.delete", "Delete Row", "CmdOrCtrl+Backspace")?)
        .build()?;

    // View: navigation and panel toggles. Next/Previous Sheet are bound to
    // bare `]` / `[` in the keymap, which can never be accelerators.
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&cmd("sheet.next", "Next Sheet", "")?)
        .item(&cmd("sheet.prev", "Previous Sheet", "")?)
        .separator()
        .item(&cmd("sheet.quickSwitch", "Search Cells", "CmdOrCtrl+P")?)
        .item(&cmd("palette.open", "Command Palette", "CmdOrCtrl+Shift+P")?)
        .separator()
        .item(&cmd("sidebar.toggle", "Toggle Sidebar", "CmdOrCtrl+Backslash")?)
        .item(&cmd("rfd.toggle", "Toggle RFD", "CmdOrCtrl+J")?)
        .build()?;

    // Help: opens the in-app keybindings guide (bound to bare `?`).
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&cmd("help.open", "Keyboard Shortcuts", "")?)
        .build()?;

    let mut builder = tauri::menu::MenuBuilder::new(app);
    builder = builder.items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu]);
    builder.build()
}
