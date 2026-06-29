//! Ebb's native menu (v1: display-only).
//!
//! ## Why display-only
//!
//! Ebb is keyboard-first and the JS keymap in `src/lib/keymap` is the single
//! source of truth for every app binding. App-command entries here (New Aff,
//! Undo, Select All, …) are shown as DISABLED reference rows with their
//! shortcut embedded in the label and NO native accelerator.
//!
//! This is deliberate, not laziness. Several app chords are focus-dependent:
//! `⌘A` means "new aff" in grid navigation focus but native select-all while
//! typing in a text box (see Component 1 / `intercept.ts`). A static macOS menu
//! accelerator cannot be focus-aware — and worse, the OS consumes an
//! accelerator chord BEFORE the webview's keydown listener runs, which would
//! break the JS keymap's focus logic entirely. So app-owned chords must never
//! become menu accelerators. Wiring menu items to commands (via emitted events,
//! never accelerators) is a later enhancement.
//!
//! Only OS-reserved chords the app keymap does NOT use keep real accelerators:
//! Quit (`⌘Q`). Minimize (`⌘M`) and Close (`⌘W`) are intentionally absent —
//! `⌘M` is the app's `move.grab` binding, and `⌘W` stays neutralized so the
//! primary window can't be closed (see the close guard in `lib.rs`).
//!
//! ## Known caveat (desktop native clipboard)
//!
//! Because no Edit-role accelerators are installed, native clipboard/editing in
//! WKWebView text fields relies on the webview's own default handling rather
//! than the macOS responder chain. Validate this at the Component 2
//! responsiveness checkpoint; if it regresses, the fix is to add real
//! Edit-role items for the non-conflicting chords only (`⌘C`/`⌘V`), keeping the
//! focus-conflicting ones (`⌘A`/`⌘X`/`⌘Z`) JS-routed.

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
    // app.exit). `⌘Q` is not an app binding, so the accelerator is safe.
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

    // Edit: native editing chords (display-only — see module docs).
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&hint("Undo                     ⌘Z")?)
        .item(&hint("Redo                   ⇧⌘Z")?)
        .separator()
        .item(&hint("Cut                      ⌘X")?)
        .item(&hint("Copy                     ⌘C")?)
        .item(&hint("Paste                    ⌘V")?)
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
