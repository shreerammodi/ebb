# Flow cell model overhaul — design

**Date:** 2026-06-04 **Status:** Approved for planning
**Supersedes (model decisions only):** `2026-06-02-editor-reference-rework-design.md` — the strict
depth=column box tree from that spec is retired; its engine (action/history/pending/decorate) is
re-pointed, not discarded.

## Goal

Overhaul how the sheet editor handles cells — placement, editing, and display — so it works the way
a real debate flow actually works, under live-round pressure. The current editor (live
`ArgumentNode` model + rigid rowspan table, and the unused depth=column box-tree engine) constrains
the user; this rework makes the structure assist and never block, matching the project philosophy
("tools must never get in the user's way; manual always overrides").

## Grounding: what real flows look like

Studied four real `.xlsm` flows in `docs/demo-flows/` (CEDA R8, CEDA R4, TOC Octos, TOC Semis).
Findings that drove every decision below:

1. **One sheet = one argument flow** (the case, a DA, the K, Framework, T), named by position —
   not just "AFF/NEG."
2. **Columns = speeches, but only those that touch that argument**, from its introduction onward.
   An aff case sheet runs `1AC→2AR`; a neg off-case (Framework) starts at `1NC` (no 1AC column).
3. **Within a column, cells are a dense free vertical list** (30–60+ lines), placed at arbitrary
   rows, with sub-points numbered by hand and tag+cite stacked inside one cell via line breaks.
4. **Clash is physical horizontal alignment, not nesting.** A response sits *across from* the
   argument it answers. Whitespace is intentional — it is the visual grouping/scanning mechanism.
5. **Columns desync in length** (e.g., Christianity DA: 2AC = 2 lines, Block = 67). When a column
   balloons, alignment is maintained per-relationship (a band), not by a global row index; new
   sub-points with no antecedent simply start their own bands. Drops were typed by hand ("DROPPED").

The strict "depth = column, single-parent rowspan, one-response-per-parent" tree (Model A / the
built engine's layout assumption) does **not** match this and is retired as the layout rule.

## Core decision: a column-free tree

A flow is a **per-sheet tree of cells** where:

- a cell's **column = the speech it was written in** — chosen freely, independent of tree depth;
- a cell's **parent = the argument it answers** — which drives **vertical alignment only**, never
  the column.

Decoupling column from depth is the crux. It yields free placement, alignment-across, auto-growing
bands, drop detection, and numbering, while reading and feeling like paper rather than an outline.

### Data model (`src/lib/model/types.ts`)

```ts
Sheet { id, title, side: 'aff' | 'neg', order, columns: Speech[] }
// columns = the contiguous run of format speeches from the argument's introduction onward.

Cell {
  id, sheetId,
  column: number,             // index into the sheet's columns (a speech). Free — any column.
  parentId: string | null,    // the cell this answers. null = a fresh argument ("root").
  order: number,              // vertical sort key — among siblings under a parent, and among
                              // roots it sets the band's top-to-bottom position on the sheet
  content: string,            // text; tag + cite expressed with line breaks
  crossed: boolean,           // conceded (line-through)
  bold: boolean,              // emphasis
  isExtension: boolean,       // extension arrow (↳) node
}
```

- **`parentId = null` in any column** → a fresh argument that starts its own **band** (off-case in
  1NC, a new block sub-point, a 2AR overview). No spacers, no forced parents.
- **`parentId = X`** → this cell shares X's band and renders across the page from X.
- Validity: a parent's column ≤ the child's column (you answer earlier-or-same speeches). Same-column
  children are allowed (sub-points within a speech) and stack vertically.

`ArgumentNode`, `NodeStatus`, and `numberOverride` are removed. `Format`, `Speech`, `Round`,
`TimerState`, `RoundMeta` are retained.

## Layout — band model on the existing elastic grid

A **band** = a root cell plus its entire answer-subtree. A band's height = the leaf-count of that
subtree — exactly what `buildLayout` (`src/lib/grid/layout.ts`) already computes as rowspan. Bands
stack vertically and push later bands down so every response stays across from its argument as
clusters grow. Columns render blank across any band where that speech said nothing (intentional
whitespace).

**Renderer changes are small:** `FlowGrid`/`GridCell` keep the elastic rowspan table; the only
structural change is **column comes from `cell.column`, not from a depth/speech lookup**, and roots
may originate in any column. The app's visual identity is unchanged: light mode, blue = Aff / red =
Neg by the speech's side, restrained text-color + thin accents, no full-cell tints.

Manual drag/move of a cell or band overrides automatic placement at any time.

## Editing & keys

- **Modeless editing is the default**: the focused cell is live; the user just types. No
  enter-edit-mode step.
- **vim-modal (`i` to edit, `Esc` to exit) is an alternate keymap**, not the default.
- All bindings remain remappable via the existing command registry / keymap system.

Default command bindings:

- `Enter` — new line below in the same column (sibling).
- `Shift+Enter` — **respond**: new cell in the next column, across from the focused argument,
  `parentId` set to it, focus jumps to it. (Replaces Tab, which the browser reserves.)
- `arrows` / `hjkl` — navigation across the tree; skips blanks; falls back to parent at edges.
- `Backspace` on an empty cell — delete.
- **Respond-to-anything**: focus any target (even far up a previous column) → respond → the new
  cell lands across from it. Free placement (click an empty cell and type) is always the fallback.

## Cells

Plain text with line breaks (tag ⏎ cite). **Manual numbering is preserved**; an auto-number toggle
numbers the roots within each column. Decorations: line-through (`crossed`), **bold**, extension
arrow (`isExtension`).

## Overlays — computed, opt-in, assist-only

- **Drop detection** (`src/lib/model/drops.ts`, rewritten): a root/argument with no child in the
  next speech that engaged the flow renders a faint, read-only badge. Ignorable.
- **Cross-applications**: a sideways reference link from one cell to another (any column/row),
  rendered as a small chip that records "also applies there" and navigates to the target. Stored as
  a separate `links` collection — never a parent edge, never affects layout.
- **Groups**: a labeled bracket over adjacent cells in one column. Operations: extend / cross /
  move as one, and **respond-to-group** as a single child whose alignment spans the group's rows.
  Stored as a separate `groups` collection (set of cell ids + label + side).

Numbering, drops, cross-apps, and groups are all overlays/annotations on top of the tree — they
assist and never block freeform placement.

## Persistence & engine salvage

- **Clean break.** Bump the Dexie schema (`src/lib/persistence/db.ts`); no migration. New
  tree-shaped JSON for export/import (`src/lib/persistence/io.ts`). Autosave infra reused.
- **Engine salvage.** The already-built, 56-test engine under `src/lib/editor/`
  (`action` + exact inverse, `history` undo/redo, `pending` coalesced edits, `decorate` bundles) is
  **re-pointed, not discarded** — those layers are agnostic to the column rule. What changes: add
  `column` and free roots to the box/cell shape; rewrite `navigation` and placement for
  column = speech (not depth); drop the spacer concept.
- `PrintView` and the export system (`src/lib/export/`) re-point at the new tree; both consume the
  shared `buildLayout` so grid / PDF / Excel place cells identically.

## Build order (for the implementation plan)

1. **Model + engine** — `types` (Cell/Sheet), tree ops, re-pointed action/history/pending/decorate,
   column=speech navigation. Pure, fully unit-tested, no UI.
2. **Renderer + editing UI** — `FlowGrid` (column from `cell.column`, free roots, bands),
   `GridCell` (modeless edit, decorations, focus wiring), drag-to-move override.
3. **Commands + keymap** — respond / new-line / navigation / decorations / delete / undo-redo on
   the remappable registry; modeless default, vim-modal alternate.
4. **Overlays + persistence** — numbering, drops, cross-app links, groups; Dexie bump; tree JSON
   export/import; print + export re-point.

## Testing

- Engine: each action's apply + inverse round-trip; undo/redo; pending-edit coalescing; navigation
  edge cases (blanks, column edges, free roots in non-zero columns, single cell).
- Layout: band height = subtree leaf-count; push-down preserves alignment; blank cells across bands;
  desynced column lengths (the Christianity DA shape).
- Overlays: drop detection over the tree; cross-app link round-trip; group bracket + respond-to-group.
- Persistence: export → import equals original tree; fresh-store schema bump.

The demo flows in `docs/demo-flows/` are the fidelity fixtures — the renderer must reproduce their
shape (free vertical placement, intentional whitespace, desynced columns, manual numbering).

## Out of scope

- Multi-target responses (one response wired to several independent parents) and free-floating
  annotations — deferred. Grouping + respond-to-group covers the common "answer many at once" case.
- Phase-2 intelligence (transcription assist, win-condition tracking) — unchanged plans; drop
  detection and cross-app links are the structural hooks it will consume.
- Any change to the app's visual identity, color discipline, or the keymap system itself.
