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

### Reality check: the substrate already exists

This model is **already what the live `ArgumentNode` model is.** `ArgumentNode` carries `speechId`
(column = speech), `parentId` (alignment-only, null = root), and `order`; `buildLayout`
(`src/lib/grid/layout.ts`) already places `col = speech index`, `rowSpan = leafCount`, and pushes
root bands down. The store (`useRoundStore`) already has coalesced snapshot undo/redo and the pure
tree ops (`model/tree.ts`: `addNode`, `setParent`, `updateText`, `toggleStatus`, `removeNode`,
`moveNode`). The command registry already has `node.addAnswer`, `node.answerAcross`, `arg.newRoot`,
the moves, status toggles, and undo/redo.

So we **extend the live model**, we do not rebuild it. The genuinely-missing pieces are: a `bold`
decoration + a decoration *display* overhaul (line-through / arrow / bold, replacing today's
"✓ conceded" text badges), the `Enter`/`Shift+Enter` create semantics, free-placement typing,
drag-to-move, per-sheet columns, groups, and cross-apps.

### Data model (`src/lib/model/types.ts`)

`ArgumentNode` is **kept and extended** — one new field:

```ts
ArgumentNode {
  id, sheetId,
  speechId,                   // column = the speech. Free — any column. (unchanged)
  parentId: string | null,    // the arg this answers; null = a root/band start. (unchanged)
  order,                      // vertical sort key within (sheet, speech, parent). (unchanged)
  text,                       // tag + cite via line breaks. (unchanged)
  statuses: NodeStatus[],     // 'conceded' → line-through, 'extended' → arrow. (unchanged)
  bold: boolean,              // NEW — emphasis decoration
  numberOverride?,            // manual-numbering break point (kept — "manual numbering preserved")
}
```

`conceded`/`extended` stay the semantic source of truth; only their **rendering** changes
(line-through and ↳ arrow instead of badge text). `Format`, `Speech`, `Round`, `TimerState`,
`RoundMeta`, `Scouting` are retained unchanged.

`Sheet` gains an optional **`startSpeechId?`** — the leftmost speech column the sheet shows
(an aff case sheet → `1AC`; a neg off-case → `1NC`). Absent = derive from the sheet's side
(aff → first speech; neg → first neg speech). Columns are then the contiguous run of
`format.speeches` from `startSpeechId` to the end.

`Round` gains two overlay collections, **`groups: ArgGroup[]`** and **`links: CrossApp[]`**,
defined in their own follow-on plans (see "Plan decomposition"). They default to `[]`.

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

## Persistence & dead-code removal

- **Additive persistence, not a rebuild.** The store and `buildLayout` already drive the tree, so
  there is no clean break. Add the `bold` field (and later `groups`/`links`) with a Dexie version
  bump whose `upgrade` defaults the new fields on existing rounds (`bold: false`, `groups: []`,
  `links: []`). JSON export/import (`src/lib/persistence/io.ts`) round-trips the new fields.
- **Delete the dead box engine.** `src/lib/editor/*` (`types`, `boxes`, `action`, `history`,
  `pending`, `navigation`, `decorate` + their 56 tests) has **no importers outside itself** — it is
  the retired depth=column design. Remove it. The live store's snapshot undo/redo and `model/tree.ts`
  already provide reversible, coalesced edits, so nothing is "salvaged" or re-pointed.
- `PrintView` and the export system (`src/lib/export/`) already consume the shared `buildLayout`;
  they only need the decoration-display update (line-through / arrow / bold) to match the grid.

## Build order (for the implementation plan)

This spec is delivered as **three independently-shippable plans** (see "Plan decomposition"). Within
the first (core) plan the order is:

1. **Model + cleanup** — add `bold` to `ArgumentNode` + `tree.ts` helper; add `Sheet.startSpeechId`
   + a pure column-derivation helper; delete the dead `src/lib/editor/*` engine. Pure, unit-tested.
2. **Display overhaul** — `GridCell` decorations (line-through / bold / ↳ arrow, replacing badges);
   `FlowGrid` renders only the sheet's columns (`startSpeechId` onward).
3. **Create / edit semantics** — `Enter` = new line below in column, `Shift+Enter` = answer-across;
   free-placement typing in an empty cell; `format.toggleBold` command; drag-to-move reparent.
4. **Persistence** — Dexie bump defaulting `bold`; JSON round-trip; autosave reused.

## Plan decomposition

Three independently-shippable plans, each producing working/testable software on its own:

1. **Cell display & editing overhaul** (this is the user's core request — written first): `bold`
   field; decoration-display overhaul; per-sheet columns; `Enter`/`Shift+Enter` create semantics;
   free-placement typing; drag-to-move; delete the dead engine; additive persistence for `bold`.
2. **Groups** (standalone overlay): `ArgGroup` collection, bracket rendering, bundle operations,
   respond-to-group; its own persistence + JSON fields.
3. **Cross-applications** (standalone overlay): `CrossApp` link collection, chip rendering,
   create/navigate; its own persistence + JSON fields.

Groups and cross-apps are pure additive overlays on the tree, so they layer cleanly onto plan 1 in
any order.

## Testing

- Pure model: `bold` round-trips through `tree.ts`/store/JSON; column-derivation helper for aff vs
  neg `startSpeechId`; existing `buildLayout`, `drops`, `numbering` tests stay green.
- Layout/display: decoration rendering (line-through / arrow / bold); `FlowGrid` shows only the
  sheet's columns; band height = subtree leaf-count (already covered).
- Editing: `Enter` adds a sibling line below and focuses it; `Shift+Enter` answers across into the
  next column; typing in an empty selected cell creates a node; drag reparents.
- Persistence: Dexie upgrade defaults `bold` on old rounds; JSON export → import equals original.

The demo flows in `docs/demo-flows/` are the fidelity fixtures — the renderer must reproduce their
shape (free vertical placement, intentional whitespace, desynced columns, manual numbering).

## Out of scope

- Multi-target responses (one response wired to several independent parents) and free-floating
  annotations — deferred. Grouping + respond-to-group covers the common "answer many at once" case.
- Phase-2 intelligence (transcription assist, win-condition tracking) — unchanged plans; drop
  detection and cross-app links are the structural hooks it will consume.
- Any change to the app's visual identity, color discipline, or the keymap system itself.
