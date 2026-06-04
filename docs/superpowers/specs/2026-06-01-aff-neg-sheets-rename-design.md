# Aff/Neg Sheets & Rename Design

**Date:** 2026-06-01  
**Status:** Approved

## Overview

Two features: (1) rename the sidebar groups from Case/Off-case to Aff/Neg, with separate hotkeys to
create sheets in each group; (2) rename individual sheets via double-click or a keybinding.

---

## Section 1: Data Model

### `Sheet.group` type change

`types.ts`: change `group: 'case' | 'offcase'` → `group: 'aff' | 'neg'`.

All callsites update:

- `Sidebar.tsx` — GROUPS config
- `RoundSetup.tsx` — bootstrap sheet becomes `{ title: 'Aff', group: 'aff' }`
- `useRoundStore.ts` — `addSheet` signature + old `sheet.new` handler default
- `selectSheetsByGroup` selector — type signature only

### IndexedDB migration

`db.ts` currently at schema version 1. Add version 2 upgrade that iterates all stored rounds and
remaps each sheet's group: `'case' → 'aff'`, `'offcase' → 'neg'`.

---

## Section 2: Commands

### Registry changes

Remove `sheet.new`. Add:

| Command ID     | Label               |
| -------------- | ------------------- |
| `sheet.newAff` | New aff sheet       |
| `sheet.newNeg` | New neg sheet       |
| `sheet.rename` | Rename active sheet |

### Handler behavior

**`sheet.newAff`**: `addSheet({ title: 'Untitled', group: 'aff' })`, then
`setActiveSheet(newSheetId)`.

**`sheet.newNeg`**: `addSheet({ title: 'Untitled', group: 'neg' })`, then
`setActiveSheet(newSheetId)`, then
`setSelection({ sheetId: newSheetId, speechId: <first neg-side speech id>, nodeId: '' })`. The first
neg speech is found by scanning `round.format.speeches` for the first entry with `side === 'neg'`
(e.g. 1NC for Policy, NC for LD).

**`sheet.rename`**: `setRenamingSheet(activeSheetId)`.

### Keymap bindings

Added to `COMMON_NORMAL` (shared across all presets):

```
'Meta+a' → sheet.newAff
'Meta+n' → sheet.newNeg  (replaces Meta+n → sheet.new)
'Meta+r' → sheet.rename   (excel / basic)
```

Vim-only (in VIM_KEYMAP normal bindings):

```
'g r' → sheet.rename   (two-key sequence — see Section 5)
```

---

## Section 3: Store

### New state

`renamingSheetId: string | null` — id of the sheet currently being renamed inline; `null` when idle.

### New action

`setRenamingSheet(id: string | null): void` — sets `renamingSheetId`.

No other store changes needed; `renameSheet(sheetId, title)` already exists.

---

## Section 4: Sidebar UI

### Group labels

GROUPS config changes: `case → aff` (label: "Aff"), `offcase → neg` (label: "Neg").

### Add buttons

Replace the single `+ Add sheet` footer button with a two-button pair: `+ Aff` and `+ Neg`, rendered
side by side. Each calls `addSheet` with the appropriate group and activates the new sheet. The neg
button also sets initial selection (mirrors `sheet.newNeg` command behavior — extract this logic
into a shared helper to avoid duplication).

### Inline rename in SheetRow

`SheetRow` receives two new props: `isRenaming: boolean` and `onStartRename: () => void`.

When `isRenaming`:

- Render an `<input>` in place of the title `<span>`, initialized to `sheet.title`
- Auto-focus and select-all on mount (`useEffect` + `inputRef.select()`)
- `onKeyDown`:
  - `Enter` → commit: call `renameSheet(sheet.id, value.trim() || sheet.title)`, then
    `setRenamingSheet(null)`
  - `Escape` → cancel: call `setRenamingSheet(null)` (no rename call)
- `onBlur` → commit (same as Enter)

When not renaming:

- Title `<span>` gets `onDoubleClick → setRenamingSheet(sheet.id)`

### Keyboard interaction safety

`useKeymap` already ignores all keys except `Escape` when focus is inside an `<input>`. When the
rename input is focused and `Escape` is pressed, `edit.exit` fires (sets mode to normal — a no-op if
already normal) and the rename input's `onKeyDown` also catches Escape to cancel. No conflict.

---

## Section 5: Two-Key Chord Sequences

The `gr` vim binding requires sequenced chord support, which the current resolver lacks.

### Approach

Add a pending-prefix accumulator to `useKeymap.ts` as a module-level mutable variable (singleton
hook, safe):

```ts
let pendingPrefix: string | null = null;
```

Chord sequences are stored in keymap bindings with a space separator: `'g r'`.

Resolution logic in `onKeyDown`:

1. Compute `chord = eventToChord(e)`.
2. If `pendingPrefix` is set:
   - Try `pendingPrefix + ' ' + chord` in the current mode bindings.
   - If found: execute command, clear prefix, `preventDefault`.
   - If not found: clear prefix, fall through to single-chord lookup.
3. If no pending prefix:
   - Check whether any binding key in the current mode **starts with** `chord + ' '` (i.e., `chord`
     is a valid prefix).
   - If it is a prefix: set `pendingPrefix = chord`, `preventDefault`, return (no command yet).
   - Otherwise: standard single-chord lookup and execute.

This is additive — existing single-chord bindings are unaffected. The prefix scan is O(n) over the
binding keys, which is tiny.

`resolveCommand` in `resolve.ts` stays unchanged; the sequence logic lives entirely in
`useKeymap.ts`.

---

## Out of Scope

- Re-ordering sheets via drag-and-drop (existing `reorderSheet` action, no UI yet)
- Meta+key browser-interception issues (flagged for a separate keybindings audit)
- Deleting sheets via keyboard (existing `removeSheet` action, no keyboard command yet)
