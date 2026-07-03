//! Ebb's native menu (v1).
//!
//! ## Menu design
//!
//! Ebb is keyboard-first and the JS keymap in `src/lib/keymap` is the single
//! source of truth for every app binding. Several app chords are focus-dependent:
//! Meta+A means "new aff" in grid navigation focus but native select-all while
//! typing in a text box (see `intercept.ts`).
//!
//! macOS WKWebView routes an editing shortcut into the focused text field only
//! when a menu item carries that accelerator; without one, the chord never
//! reaches the field (Meta+C copies nothing, etc.). So Cut/Copy/Paste are real
//! `PredefinedMenuItem`s: their chords (Meta+X / Meta+C / Meta+V) are not app
//! bindings, so installing the accelerators costs nothing and fixes native
//! clipboard editing.
//!
//! The remaining editing chords collide with app bindings and therefore stay
//! display-only (a menu accelerator is consumed by the OS *before* the webview's
//! keydown fires, which would silently break the JS keymap's focus logic):
//! Meta+A is `sheet.newAff`, Meta+Z is `edit.undo`, Shift+Meta+Z is `edit.redo`.
//! Meta+A's text-field behavior (select-all) is instead restored in JS - see
//! `selectAllInElement` / `useDesktopSelectAll` in `src/lib/keymap`.

use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Menu item id for the single deliberate-exit path.
pub const QUIT_ID: &str = "quit";

/// Builds the application menu.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // A greyed reference row: shows the binding, does nothing when clicked.
    let hint = |label: &str| -> tauri::Result<_> {
        MenuItemBuilder::new(label).enabled(false).build(app)
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
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&quit)
        .build()?;

    // File: app creation / structure commands (display-only).
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&hint("New Aff Sheet            ⌘A")?)
        .item(&hint("New Neg Sheet            ⌘N")?)
        .item(&hint("Rename Sheet             ⌘R")?)
        .separator()
        .item(&hint("Settings                 ⌘,")?)
        .build()?;

    // Edit: Cut/Copy/Paste carry real accelerators so WKWebView routes them to
    // the focused text field. Undo/Redo/Select All are display-only because
    // their chords are app bindings the JS keymap owns (see module docs).
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&hint("Undo                     ⌘Z")?)
        .item(&hint("Redo                   ⇧⌘Z")?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&hint("Select All               ⌘A")?)
        .build()?;

    // View: structural toggles (display-only).
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&hint("Toggle Sidebar           ⌘\\")?)
        .item(&hint("Quick Switch Sheet       ⌘K")?)
        .item(&hint("Command Palette          ⌘P")?)
        .build()?;

    // Help: pointers; the keymap itself remains discoverable in-app.
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&hint("Keyboard shortcuts live in Settings")?)
        .build()?;

    let mut builder = tauri::menu::MenuBuilder::new(app);
    builder = builder.items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu]);
    builder.build()
}
