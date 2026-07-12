# Changelog

All notable changes to Ebb are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Desktop menu shortcuts are real native accelerators: they right-align in
  the macOS shortcut column, and they follow custom keybindings set in
  Settings.

## [0.3.2] - 2026-07-10

### Fixed

- Opening Settings > Updates on the desktop no longer blanks the whole app with
  a "This page couldn't load" error. The Updates pane reads the update context,
  but the settings panel was mounted outside its provider, so rendering it threw
  and Next's root error boundary replaced the app.
- Reload the desktop app on a flow or trash page and it comes back instead of
  showing WKWebView's "This page couldn't load" error. The static export now
  emits an index.html for each route so a bare-path load (such as the reload
  after an update relaunch) resolves in Tauri's asset server.

## [0.3.1] - 2026-07-10

### Fixed

- Check for updates again. GitHub moved release-asset downloads to a new host,
  which the desktop app's content-security-policy did not allow, so the update
  check failed silently. The policy now allows GitHub's user-content hosts.

## [0.3.0] - 2026-07-10

### Added

- Insert a cell below the selection with Meta+Alt+o (Ctrl+Alt+o elsewhere).
- An "Insert paste" setting under Editor > Paste. With it on, pasting pushes the
  text already in the target columns down instead of writing over it;
  neighboring speeches keep their rows.
- Move cells with Meta+Shift+m (Ctrl+Shift+m elsewhere). Up and Down nudge the
  selected cells along their column and the cells they pass over flow around
  them; Meta/Ctrl with them lands the block against the next filled cell. Enter
  commits the whole move as one undo step, Esc puts everything back.
- Show the installed version and platform in Settings > Updates.

### Changed

- Open Settings with its chord from any screen, not just the dashboard and a
  flow.
- Read the flow library once per session instead of on every dashboard visit,
  so returning from a flow, or refreshing after a rename or delete, no longer
  reloads every round.
- Scroll and edit the grid without rebuilding each column's styling for every
  visible cell on every frame.
- Show placeholder cards while Trash loads instead of a blank screen.

### Fixed

- Undo a cell insert and its decorations come back with its text, instead of
  the bold or highlight staying a row down from the cell it belongs to.

## [0.2.2] - 2026-07-08

### Added

- Bulk-add sheets from the ribbon and the command palette.
- Enumerate default sheet names per-side.

### Changed

- Group the keybindings in `config.toml` into nested `[keymap.*]` tables
  instead of quoted dotted keys. Files from earlier versions are still read
  and migrate to the new layout on the next settings change.
- Make the empty-state Judge a peer button inline with Aff/Neg.

### Fixed

- Create and source `config.toml` on launch even when no flow is open, so a
  fresh install no longer skips it until the first flow is opened.

## [0.2.1] - 2026-07-08

### Fixed

- Hoist the update provider so the Updates settings tab can't crash.

## [0.2.0] - 2026-07-08

### Added

- Export through the native Save As picker instead of a forced download.
- Ship the full default keymap and every configurable command in
  `config.toml`.

### Changed

- Split the in-app guide into a keyboard-shortcut sheet plus external docs.
- Build a single macOS universal binary.

### Fixed

- Stop the Close tooltip from auto-popping when a dialog opens.
- Show Cmd+Arrows for jump-to-edge on Mac in the guide.
- Right-align menu chord hints against a shared column.

## [0.1.1] - 2026-07-07

### Changed

- Ad-hoc sign macOS builds and document the Gatekeeper quarantine bypass.
- Ship AppImage only on Linux; drop Flatpak distribution.

## [0.1.0] - 2026-07-07

### Added

- Initial tagged release.

[Unreleased]: https://github.com/shreerammodi/ebb/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/shreerammodi/ebb/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/shreerammodi/ebb/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shreerammodi/ebb/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/shreerammodi/ebb/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/shreerammodi/ebb/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/shreerammodi/ebb/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/shreerammodi/ebb/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shreerammodi/ebb/releases/tag/v0.1.0
