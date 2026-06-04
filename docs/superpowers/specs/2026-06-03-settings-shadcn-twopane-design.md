# Settings dialog redesign — shadcn two-pane

**Date:** 2026-06-03 **Component:** `src/components/SettingsPanel.tsx` **Status:** Approved design

## Goal

Rebuild the settings menu as a full visual redesign on top of shadcn primitives. Replace the
hand-rolled modal overlay and raw `<input type="checkbox">` controls with shadcn `Dialog` and
`Switch`, and reorganize the content into a two-pane (sidebar-nav) layout that separates the short
**Display** settings from the long **Keyboard** shortcut list.

## Decisions

- **Layout:** Two-pane. Left sidebar lists categories (`Display`, `Keyboard`); right pane shows the
  active category's content. (macOS / VS Code settings style.)
- **Toggle control:** shadcn `Switch`.
- **Shortcut search:** Yes — a filter `Input` at the top of the Keyboard pane that filters commands
  by label as the user types.

## Architecture

### Shell

- `SettingsPanel` renders `<Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>` so
  open/close flows through the Zustand store (`settingsOpen` / `setSettingsOpen`).
- `DialogContent`:
  - `data-testid="settings-panel"`, keeps the existing `onKeyDown` handler.
  - Centered (shadcn default), fixed width ~`560px`, `max-h-[84vh]`.
  - Padding removed (`p-0`) so the two panes meet a full-height divider; internal scrolling lives on
    the right pane.
  - Built-in radix close button disabled (`showCloseButton={false}`).

### Panes

Local component state: `activeCategory: 'display' | 'keyboard'` (default `'display'`).

- **Left nav** (~130px, right border):
  - `Display` item — `data-testid="settings-nav-display"`
  - `Keyboard` item — `data-testid="settings-nav-keyboard"`
  - Active item gets the shadcn `bg-accent` / accent-foreground treatment.
- **Right content** (scrollable, `overflow-y-auto`): renders **only** the active category.
  - **Display:** two rows, each `label` + shadcn `Switch`:
    - `toggle-autoNumber` → `autoNumber` / `setAutoNumber`
    - `toggle-labelDrops` → `labelDrops` / `setLabelDrops`
  - **Keyboard:**
    - Preset switcher: `Default` / `Vim` Buttons (`preset-default`, `preset-vim`), unchanged
      behavior (`selectPreset`).
    - Filter: shadcn `Input`, local `query` state. Filters `COMMAND_LIST` by `cmd.label`
      (case-insensitive `includes`). `data-testid="shortcut-filter"`.
    - Command list: for each matching command, a row with label, chord badge (`chord-<id>`),
      `Record` button (`record-<id>`), `Reset` button (`reset-<id>`), wrapped in `cmd-<id>`.
      Behavior unchanged.

### New ui component

- Add `src/components/ui/switch.tsx`, authored against the installed unified `radix-ui` package
  (`import { Switch as SwitchPrimitive } from "radix-ui"`), matching the import/style conventions of
  the existing `dialog.tsx`. No shadcn CLI / network needed.
- `input.tsx`, `button.tsx`, `dialog.tsx` already exist and are reused.

## Behavior preserved

- **Chord recording:** unchanged. The content-level `onKeyDown` captures the next keydown while
  `recording` is set, converts it via `eventToChord`, and stores the override. Lone modifier keys
  are ignored.
- **Escape:**
  - Not recording → Escape closes the dialog (via radix `onOpenChange(false)`).
  - Recording → intercept radix `onEscapeKeyDown`, `preventDefault()`, and cancel recording instead
    (do **not** close). This preserves today's Escape-cancels-recording behavior.
- **Close button:** a `DialogClose` in the header carries `data-testid="settings-close"`; clicking
  it closes via `onOpenChange`.
- **Filter input** only filters by label; it never initiates or interferes with recording (recording
  capture is at the content level, as today).
- **Closed state:** when `settingsOpen` is false, radix renders no content, so `settings-panel` is
  absent from the DOM.

## Test impact

Existing `SettingsPanel.test.tsx` behaviors are preserved, with navigation-aware updates (TDD —
update tests first, then implement):

- Shortcut-related tests (`cmd-*`, `record-*`, `reset-*`, `chord-*`, preset switch, persistence) now
  click `settings-nav-keyboard` before asserting, because those rows live in the Keyboard pane.
- The Display-switch test (`toggle-autoNumber`) stays as-is — Display is the default pane.
- New tests:
  - Switching to the Keyboard nav reveals the command list; Display nav hides it.
  - The shortcut filter narrows the visible command rows by label.
- Escape/close behavior tests continue to assert against `settings-panel` and `settings-close`.

## Out of scope

- No changes to keymap logic (`effectiveKeymap`, `eventToChord`, the keymap store slice), the
  commands registry, or any consumer of the settings store.
- No new settings categories beyond Display and Keyboard.
