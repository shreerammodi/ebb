# Editor rework on the reference model — design

**Date:** 2026-06-02
**Status:** Approved for planning
**Reference:** Ashwagandhae "Flower" (`../ashwagandhae/debate-flow`, SvelteKit) — its editor is the
basis for this rework.

## Goal

Rebuild this app's flow editor so it has the reference editor's quality — thoroughly
implemented, bug-free, and good to use — while **preserving this app's existing visual
identity**: the elastic rowspan grid, light mode, and reserved colors (blue = Aff, red =
Neg). The reference is Svelte; nothing is copied verbatim. We port its *model and editing
engine* and render them through our existing React/Zustand grid.

## Why the reference is good (what we are actually adopting)

The quality lives in the editing engine, not the visuals:

1. **Action / inverse-history layer** — every mutation returns its own inverse, so undo/redo
   is exact and every edit is reversible.
2. **Coalesced text edits** — typing batches into one action committed on blur / focus
   change, instead of one history entry per keystroke.
3. **Single focus source of truth** — one store value says what is focused; the focused box
   auto-focuses its textarea; last focus is remembered per sheet.
4. **Exhaustive keyboard navigation with edge handling** — traversal that skips empty boxes
   and falls back to the parent at column edges (eliminates the "cursor stuck at last node"
   class of bug we have been fighting).

Plus manual box decorations (cross-out, bold, extension) and folding.

## Key realization: the grid already fits the model

The reference lays a box at nesting-depth N into column N, with children flowing into column
N+1. Our elastic rowspan table already renders exactly this shape: a parent spans the rows of
its leaf-descendants and children sit in the next column, and `buildLayout`'s `leafCount`
already computes the needed rowspan. So keeping the visual identity and adopting the reference
model are compatible — **the table becomes the renderer for the ported tree.**

## Decisions (locked during brainstorming)

- **Adopt the reference model**, not just interactions. A box's **column = its depth**; empty
  "spacer" boxes let an argument start in a later speech and are skipped by navigation.
- **Map semantic features onto reference decorations:** `conceded` → `crossed`,
  `extended` → `isExtension` (arrow node); add `bold`. Auto-**numbering** and **drop
  detection** are kept as **read-only overlays computed from the tree** (no model fields).
- **Clean break on persistence:** bump the Dexie schema version, start fresh; define a new
  tree-shaped JSON export/import format. Existing saved rounds are discarded. No migration
  code.
- **Keep this app's keymap system:** the remappable command registry with the vim-style
  default — *not* the reference's hardcoded chords. The command set is expanded to drive the
  new engine.

## 1. Data model (`src/lib/model/types.ts`)

A per-sheet tree of boxes. Columns come from the shared `format.speeches` (unchanged).

```ts
Sheet  { id, title, side: 'aff' | 'neg', order }        // ~ reference Flow
Box {
  id, sheetId,
  parentId: string | null,   // null = column 0 (root box)
  order: number,             // sort key within siblings
  content: string,
  empty: boolean,            // spacer; renders blank, skipped by navigation
  crossed: boolean,          // was: status 'conceded'
  bold: boolean,             // new
  isExtension: boolean,      // was: status 'extended' (arrow-icon node)
}
```

A box's **column index = number of ancestors** (root boxes = 0). It is derived, never stored,
and validated against `format.speeches.length`. To place a real box in column 3, its ancestor
chain holds empty spacer boxes in columns 0–2.

`Format`, `Speech`, `Round`, `TimerState`, `RoundMeta` are retained. `ArgumentNode`,
`NodeStatus`, and `numberOverride` are removed.

### Units

- **`model/types.ts`** — types only.
- **`model/tree.ts`** — pure tree ops over `Box[]`: children-of, parent-of, ancestors,
  descendants, depth/column, leaf-count, sibling order. No store access.

## 2. Editing engine (`src/lib/model/`)

Ported from the reference, idiomatic to Zustand. All pure/unit-tested where possible.

- **`model/action.ts`** — `Action` = `add | delete | update | move | replace | identity`.
  `applyAction(boxes, action)` mutates and **returns the inverse action** (identity on
  failure). `applyActionBundle` applies a list and returns the reversed inverse bundle.
- **`model/history.ts`** — undo/redo stacks of inverse bundles. `undo()` / `redo()` apply a
  bundle and push its inverse onto the opposite stack. Bundles group a logical edit.
- **`model/pending.ts`** — coalesced text edits. A `pendingEdit` holds the box id and latest
  content; it is committed as a single `update` action on focus change / blur, so undo
  granularity is per-field-session, not per-keystroke.
- **`model/focus.ts`** — focus model: `focusId: string | null` and `lastFocusBySheet`. The
  focused box auto-focuses its textarea on mount / focus change. Replaces the current
  `selection` value.
- **`model/decorate.ts`** — high-level helpers that emit action bundles: `addSibling`,
  `addChild`, `addExtension`, `deleteBox`, `toggleCrossed`, `toggleBold`, with the
  empty-spacer and extension-position rules from the reference.

These live in the Zustand store (`src/lib/store/useRoundStore.ts`), which is rewritten to hold
the box tree, focus, pending edit, and history, and to route all mutations through the action
layer.

## 3. Renderer — keep the elastic grid (`FlowGrid`, `GridCell`)

`buildLayout` is retained; the only change is **col = box depth** (not a `speechId` lookup),
and empty boxes render as blank cells. `rowSpan` = subtree leaf-count, exactly as today.

`GridCell` gains:

- line-through when `crossed`, bold when `bold`,
- the extension arrow icon when `isExtension`,
- fold toggle + collapsed state,
- a textarea wired to `focusId` with the coalesced-edit (`beforeinput` → pending) flow.

Colors stay **blue = Aff / red = Neg by the speech's side** (our identity), not the
reference's level-alternation palette.

## 4. Navigation, commands & keymap

- **`src/lib/grid/navigation.ts`** is replaced by tree traversal ported from the reference's
  `getAdjacentBox`: up/down across nesting, skip empties, fall back to parent at edges.
- **Command registry** (`src/lib/commands/`) gains commands wired to the engine:
  - navigation: up, down, parent (left), child (right), next/prev sibling;
  - structure: add sibling above/below, add child / nest (Tab), delete-when-empty
    (Backspace), "respond to next argument";
  - decorations: toggle crossed, toggle bold, add extension;
  - fold: toggle fold;
  - history: undo, redo.
- All commands remain remappable via the existing keymap system, with the vim-style preset as
  default.

## 5. Overlays & persistence

- **Numbering** (`numbering.ts`) and **drop detection** (`drops.ts`) are rewritten to read the
  box tree and render as read-only overlays (display numbers, drop badges). No model fields.
- **Persistence:** bump Dexie version, fresh store (`persistence/db.ts`); new tree-shaped JSON
  for export/import (`persistence/io.ts`); autosave infra reused.
- **PrintView** re-pointed at the tree.
- **Untouched:** `Sidebar`, `RoundSetup`, `Workspace`, `Timers`, `QuickSwitcher`, keymap
  settings panel, `KeybindingsCheatsheet`, format presets, `globals.css` look.

## 6. Build order (for the implementation plan)

1. **Model + engine** — types, tree ops, action/inverse, history, pending edits, focus,
   decorate helpers. Pure logic, fully unit-tested, no UI.
2. **Renderer + editing UI** — `FlowGrid` (col = depth, empties), `GridCell` (decorations,
   fold, coalesced edit, focus wiring).
3. **Commands + keymap rewire** — new command set on the remappable registry, plus undo/redo.
4. **Overlays + persistence** — numbering/drops over the tree, Dexie bump, new JSON
   export/import, print view.

## Testing

- Engine: unit tests for each action's apply + inverse round-trip; history undo/redo;
  pending-edit coalescing; navigation edge cases (empties, column edges, single node).
- Renderer: layout for nested trees with spacers; decoration rendering; fold collapse.
- Persistence: round-trip export → import equals original tree; fresh-store schema bump.

The current 312 Phase-1 tests tied to the removed model are retired or re-pointed; new tests
cover the new model and engine.

## Out of scope

- Phase-2 intelligence (transcription assist, win-condition tracking) — unchanged plans.
- Collaboration / sharing (the reference's `sharingChannel`, `frozen`) — not ported.
- Adopting the reference's visual styling or hardcoded keymap.
