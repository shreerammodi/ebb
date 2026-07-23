# Changelog

This file documents all notable changes to Ebb.

This changelog uses the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format, and this project obeys [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Excel-style KeyTips on the dashboard. Push `f` to paint the key for each
  control, then push a key to fire it: `n` new flow, `i` import, `e` export,
  `t` trash, `s` search, `,` settings, and `?` shortcuts. `l` focuses the flow
  list for arrow-key navigation, where Up and Down move a full grid row, and
  reveals `s` (sort) and `t` (group by tournament). The new-flow menu paints a
  key for each flow type, including the Public Forum first-speaker submenu.
  Escape steps back one level. Every key is configurable in `config.toml` under
  the `[keytips]` table.

### Fixed

- Renaming a sheet, whether from the rename command or by clicking its title in
  the sidebar, returns keyboard focus to the grid on commit, so the next
  keystroke edits the flow instead of falling on the page body.

## [0.5.2] - 2026-07-20

### Added

- A Lincoln-Douglas flow template. Create an aff, neg, or judge flow with the
  1AC, 1NC, 1AR, 2NR, and 2AR speeches and their cross-examination periods.

### Fixed

- The desktop window no longer enforces a minimum width, so it can shrink to
  match the narrow-window dashboard layout.

## [0.5.1] - 2026-07-19

### Added

- Record a flight alongside the round. The flight shows in the flow's info
  panel and next to the round on its dashboard card.
- The round date is a calendar picker, not a plain text field.

### Changed

- The dashboard prepares the flow editor while idle. The first flow you open
  then loads its grid from cache. It does not fetch and parse the grid on open.
- On narrow windows, the dashboard menu bar shows its buttons as icons and
  removes the brand logo. The controls then stay visible and do not overlap.
- The dashboard's Settings and Info buttons swap order, and the
  keyboard-shortcuts button uses a question icon to match its help role.

### Fixed

- Opening a flow no longer flashes an empty black grid before the cells
  appear. The grid stays hidden until its first data load completes, then
  shows fully drawn.

## [0.5.0] - 2026-07-18

### Added

- Public Forum rounds. Choose which side speaks first when you create one, and
  flow its cross-examination on a dedicated sheet. The "Swap speaking order"
  palette command changes the speaking order at any time.
- Palette search understands sheet and column context: "2ac warming" finds
  warming answers in the 2AC column, ranked below direct text matches.
- A Display setting to turn off tooltips. Hover hints show by default. The
  toggle hides them everywhere.
- Jumping to a search result now briefly flashes the target cell in the
  selection violet. The eye then finds the cursor after the viewport
  teleports.

### Changed

- Excel export is rebuilt: each sheet exports with its cell styling intact,
  alongside Info and RFD worksheets. The app no longer ships a bundled
  spreadsheet template.
- Palette matching is order-independent ("da warming" finds "Warming DA") and
  ranks results by how directly they match: exact, then prefix, then
  word-start, then substring anywhere.
- Search palette redesign: single-line result rows with a column badge in
  aff/neg ink and the sheet name on the right. A key-hint strip sits under the
  results, and long lists page behind a "show more" row. The bar shows a brief
  violet pulse as it opens. Matched-character bolding is gone in favor of
  calmer plain-text rows.
- The search palette opens and closes instantly with no animation.
- Dialogs, menus, tooltips, and the flow detail drawer share one easing curve
  with quicker, consistent timings (exits slightly faster than entrances).
  Their movement now respects the system reduced-motion preference.

### Fixed

- "Rename active sheet" no longer does nothing when the sidebar is collapsed.
  The command opens the sidebar first so there is a row to edit.
- "Rename active sheet" now renames the sheet in the focused pane. In split
  view, running it while Tab 2 is focused renamed Tab 1's sheet.

## [0.4.1] - 2026-07-16

### Added

- A Display setting to turn off scroll-to-zoom. Mod+scroll and trackpad pinch
  zoom the flow grid by default. The toggle disables that gesture.

### Fixed

- Shift+Tab in the first grid column keeps the cursor in the grid and does not
  yield focus to the sidebar.

### Removed

- Move mode no longer follows the mouse. Picking up a block and dropping it is
  keyboard-driven (Up/Down/Enter) as before.

## [0.4.0] - 2026-07-16

### Added

- Zoom the flow grid. Minus/plus buttons around a slider, a click-to-edit
  percentage field, Mod+scroll over the grid, and "Zoom in"/"Zoom out"
  command-palette commands all scroll in 10% steps. Settings gains a "Default
  zoom" that the grid opens at, synced to the desktop config file.
- Move mode follows the mouse: the picked-up block tracks the hovered row and a
  click releases it, mirroring the keyboard Up/Down/Enter path.

### Removed

- Tournament Mode. Each update waits for you to press "Install latest update",
  so a separate switch to pin the version was redundant. Updates install only
  when you confirm.

## [0.3.8] - 2026-07-15

### Added

- The Updates settings pane has a single "Install latest update" button. It is
  greyed, with an "already on the latest version" tooltip, until the app
  downloads a newer version. It then turns green and is one click from
  installing and relaunching. You get to that state by letting checks run
  automatically or by pressing "Check for updates".

### Fixed

- The "update downloaded" chip now appears on all screens - the dashboard and
  trash as well as an open flow - not only while a flow is open.

## [0.3.7] - 2026-07-15

### Fixed

- Reordering sheets by drag-and-drop now works in the desktop app. The
  window's OS-level drag-drop handler no longer swallows the in-app drop.
- The sidebar now accepts a sheet drop anywhere in the sheet list - between
  rows, on the section label, or below the last row. Before, only a drop
  directly on a row worked.

## [0.3.6] - 2026-07-15

### Changed

- Desktop updates ask before installing. A check downloads the new version, but
  only rewrites the install on disk when you confirm. You confirm from the
  update chip (now labelled "Update x.y.z - Install") or the critical-update
  modal. A repeat check skips re-downloading a staged version.
- The manual "Check for updates" button reports its outcome (up to date, or a
  check, download, or install failure). It no longer goes idle silently.

### Fixed

- A fast drag-and-drop of a sheet in the sidebar now reorders it. A quick drag
  then drop no longer bails out reading stale drag state.
- The settings panel keeps a stable size while navigating between its
  categories.

## [0.3.5] - 2026-07-15

### Added

- Rename a sheet straight from the pane title bar. Click anywhere in the title
  strip to edit its name in place, the same rename the sidebar offers.
- A bulk-add field in the sidebar sets how many rows to add at once, matching
  the Excel-template flow.

### Changed

- The keyboard-shortcuts button moves next to Settings in the round header and
  shows a help icon to match it. The cheatsheet footer links to the docs site.
- Add-sheet buttons are identified by color.
- The round header removes its Import button. Importing a flow lives on the
  dashboard, not inside an open round.
- Switching sheets is faster.
- The settings panel is laid out as divided rows with the control on the right,
  and its sidebar gains an icon per category.
- Focus rings on inputs, selects, buttons, and toggles are a single thin violet
  border, not a thick glowing halo.

### Fixed

- The round header stays readable when the window is narrow. The left and right
  groups no longer overlap, and the autosave label shows only its icon below
  the small breakpoint.
- The bulk-add field keeps its rounded shape on focus and hides its placeholder,
  so the caret no longer cuts through the digit.
- On Windows and Linux, the window close button now quits the app. The close
  guard is macOS-only. It keeps a round from being lost to an accidental close,
  and matches that platform's close-is-not-quit norm.

## [0.3.4] - 2026-07-13

### Fixed

- Auto-update and the manual "Check for updates" button work again on the
  desktop app. The update check read the release manifest with a webview fetch.
  GitHub's release CDN sends no CORS headers, so it blocked the cross-origin
  read and each check failed silently. The manifest now loads through the
  updater plugin, which fetches it outside the webview. Existing 0.3.3 and
  earlier installs cannot self-update to this fix. Install 0.3.4 manually once,
  and automatic updates resume from there.

## [0.3.3] - 2026-07-13

### Changed

- Desktop menu shortcuts are real native accelerators: they right-align in
  the macOS shortcut column, and they follow custom keybindings set in
  Settings.

## [0.3.2] - 2026-07-10

### Fixed

- Opening Settings > Updates on the desktop no longer replaces the full app
  with a "This page couldn't load" error. The Updates pane reads the update
  context, but the settings panel mounted outside its provider. Rendering it
  threw, and Next's root error boundary replaced the app.
- Reload the desktop app on a flow or trash page and it comes back, with no
  WKWebView "This page couldn't load" error. The static export now emits an
  index.html for each route so a bare-path load (such as the reload after an
  update relaunch) resolves in Tauri's asset server.

## [0.3.1] - 2026-07-10

### Fixed

- Check for updates again. GitHub moved release-asset downloads to a new host.
  The desktop app's content-security-policy did not allow that host, so the
  update check failed silently. The policy now allows GitHub's user-content
  hosts.

## [0.3.0] - 2026-07-10

### Added

- Insert a cell below the selection with Meta+Alt+o (Ctrl+Alt+o elsewhere).
- An "Insert paste" setting under Editor > Paste. With it on, pasting pushes the
  text in the target columns down and does not write over it. Neighboring
  speeches keep their rows.
- Move cells with Meta+Shift+m (Ctrl+Shift+m elsewhere). Up and Down nudge the
  selected cells along their column, and the cells they pass over flow around
  them. Meta/Ctrl with them puts the block against the next filled cell. Enter
  commits the full move as one undo step, and Esc puts everything back.
- Show the installed version and platform in Settings > Updates.

### Changed

- Open Settings with its chord from any screen, not just the dashboard and a
  flow.
- Read the flow library once per session, not on each dashboard visit.
  Returning from a flow, or refreshing after a rename or delete, no longer
  reloads all rounds.
- Scroll and edit the grid without rebuilding each column's styling for all
  visible cells on each frame.
- Show placeholder cards, not a blank screen, while Trash loads.

### Fixed

- Undo a cell insert and its decorations come back with its text. The bold or
  highlight no longer stays a row down from the cell it belongs to.

## [0.2.2] - 2026-07-08

### Added

- Bulk-add sheets from the ribbon and the command palette.
- Enumerate default sheet names per-side.

### Changed

- Group the keybindings in `config.toml` into nested `[keymap.*]` tables, not
  quoted dotted keys. Ebb continues to read files from earlier versions, and
  migrates them to the new layout on the next settings change.
- Make the empty-state Judge a peer button inline with Aff/Neg.

### Fixed

- Create and source `config.toml` on launch even when no flow is open, so a
  fresh install no longer skips it until the first flow is opened.

## [0.2.1] - 2026-07-08

### Fixed

- Hoist the update provider so the Updates settings tab cannot crash.

## [0.2.0] - 2026-07-08

### Added

- Export through the native Save As picker, not a forced download.
- Ship the full default keymap and each configurable command in
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
- Ship AppImage only on Linux. Remove Flatpak distribution.

## [0.1.0] - 2026-07-07

### Added

- Initial tagged release.

[Unreleased]: https://github.com/shreerammodi/ebb/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/shreerammodi/ebb/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/shreerammodi/ebb/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/shreerammodi/ebb/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/shreerammodi/ebb/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/shreerammodi/ebb/compare/v0.3.8...v0.4.0
[0.3.8]: https://github.com/shreerammodi/ebb/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/shreerammodi/ebb/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/shreerammodi/ebb/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/shreerammodi/ebb/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/shreerammodi/ebb/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/shreerammodi/ebb/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/shreerammodi/ebb/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/shreerammodi/ebb/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shreerammodi/ebb/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/shreerammodi/ebb/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/shreerammodi/ebb/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/shreerammodi/ebb/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/shreerammodi/ebb/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shreerammodi/ebb/releases/tag/v0.1.0
