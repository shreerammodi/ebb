# Flow editor — port the ashwagandhae model onto the column-free tree

**Date:** 2026-06-05 **Status:** Approved for planning
**Supersedes (editor/layout decisions only):** `2026-06-04-flow-cell-model-design.md` — the data
model (column-free `ArgumentNode` tree) is kept; this spec replaces how the editor *renders,
navigates, and creates* cells, adopting the interaction model of the reference app.

> **Implementation note (decided 2026-06-05, at planning):** The plan
> `docs/superpowers/plans/2026-06-05-flow-editor-ashwagandhae-port.md` achieves these goals with a
> lower-risk approach than the "recursive rewrite + new fields" sketched below. `buildLayout`
> already *is* the shared placement function and already produces the band layout incl.
> roots-anywhere, so it is **kept** (not replaced); the new `empty`/`isExtension` fields are
> **not added** — spacing uses normal empty-text nodes and "extension" reuses the existing
> `'extended'` status (already rendered as `↳` inside a cell). Goals (physical nav, modeless
> single-line cells, roots-anywhere, Excel-tight visual, everything-is-a-cell) are unchanged.

## Goal

The editor still feels clunky, mostly around arrow-key navigation and the lack of a fluid
tree+freeform feel. Rather than invent an interaction model, we adopt — almost verbatim — the one
from the reference app **ashwagandhae/debate-flow** ("Flower",
`../../ashwagandhae/debate-flow/`), which the user wants to match. The **one deliberate deviation**
is that **roots may be created in any column** (the reference forces roots to column 0). Plus a
**visual refresh** into this app's design language.

## Grounding: how the reference works

Read end-to-end (`src/lib/models/node.ts`, `nodeAction.ts`, `nodeDecorateAction.ts`,
`src/lib/components/Box.svelte`, `Flow.svelte`, `Text.svelte`):

- **Tree:** `Root → Flow(s) → Box(es)`. A `Box`'s **tree depth (`level`) = its column**, and its
  `parent` is the box it answers. **Clash = nesting**: a response is a child box rendered one column
  to the right; multiple responses = multiple children stacking; a parent's rendered height grows
  with its whole subtree (this is how desynced column lengths are handled for free).
- **Rendering is recursive, not a rowspan table.** `Box.svelte` is a CSS-grid
  `grid-template-areas:'a b'` — own content in `a`, a nested `<ul>` of children in `b`. The browser
  stacks siblings and grows parents automatically.
- **Editing is modeless.** Focusing a box focuses its `<textarea>`; you just type. **All four arrow
  keys are intercepted** (`preventDefault`) to navigate boxes, never to move the caret.
- **Boxes are single-line.** `Text.svelte`'s `autoHeight` strips newlines
  (`replace(/\r?\n|\r/g,'')`); `Enter` is intercepted, so a box can never contain a line break.
- **`empty` boxes** are invisible spacer cells (`opacity:0; pointer-events:none`). The reference's
  only way to start an argument deeper in is `addNewEmpty`, which builds a chain of `empty`
  ancestors then the real box — a hack we will not need.

### Reference keymap (`Box.svelte` `keyComboOptionsIndex`)

| Key | Action |
|---|---|
| `↑` / `↓` | focus the visually-adjacent box in the column (`getAdjacentBox`), skipping `empty`; at column top, fall back to parent/flow |
| `←` | focus parent (column to the left) |
| `→` | focus first child (column to the right) |
| `Tab` / `Shift+Tab` | focus next / previous sibling (Tab may fall through to parent) |
| `Enter` | new sibling box below, focus it |
| `Shift+Enter` | **respond** — new child box in the next column, focus it |
| `Alt+Enter` | new sibling (above-biased variant) |
| `Alt+Shift+Enter` | respond to the *next* argument (child of parent's adjacent sibling) |
| `Cmd/Ctrl+E` | add an **extension** child box (the `↳` cell) |
| `Ctrl+L` | fold / unfold a subtree |
| `Cmd/Ctrl+Backspace` | delete box; `Backspace` on an empty box also deletes |
| `Cmd/Ctrl+B` | bold |
| `Ctrl+Shift+X` | conceded (line-through) |

## Core decision: port the *UX*, keep our *data model*

The reference's column = depth means roots are stuck in column 0; it fakes deeper starts with
`empty` chains. **Our existing `ArgumentNode` already solves this**: it carries `speechId` (column —
free, any column) *independently* of `parentId` (clash link, null = root). That is a column-free
tree, so **roots-anywhere is native**. Therefore we **re-create the reference's editor feel on top
of our `ArgumentNode` store** rather than importing its `Root/Flow/Box` types. We keep
`useRoundStore`, `model/tree.ts` ops, persistence/JSON, export, undo, the command registry/keymap
system, CX sheets, timers, search, and settings.

### Invariant: within a clash subtree, child column = parent column + 1

A response always lands in the column immediately right of the box it answers. Answering across
several speeches is a deepening chain of children. This makes clash exact and lets the recursive
layout work. **Roots (`parentId === null`) keep a free `speechId`** — their subtree nests rightward
from that start column. The editor enforces `child.speechId = nextColumnAfter(parent.speechId)` on
create; `speechId` remains the persisted source of truth for which speech a box sits in.

### Data model (`src/lib/model/types.ts`)

`ArgumentNode` is kept; mirror the reference's `Box` flags by adding two booleans:

```ts
ArgumentNode {
  id, sheetId,
  speechId,                 // column. Free for roots; = parent's column + 1 for children. (unchanged)
  parentId: string | null,  // clash parent (box answered); null = root. (unchanged)
  order,                    // sibling order among children of the same parent. (unchanged)
  text,                     // SINGLE LINE — newlines stripped on input. (semantics tightened)
  statuses: NodeStatus[],   // 'conceded' → line-through. (unchanged)
  bold: boolean,            // (unchanged)
  empty: boolean,           // NEW — invisible spacer cell; skipped by navigation
  isExtension: boolean,     // NEW — the ↳ extension cell (readonly content, arrow marker)
  numberOverride?,          // (unchanged)
}
```

Fold state stays ephemeral UI state (a `Set<nodeId>` in the store/UI, like the reference's `folded`
map) — not persisted. Extension cells replace the old `'extended'` *status*: extension is now a
**cell** (`isExtension`), created via `Cmd+E`, not a decoration on another node — this is required
by "everything is a cell."

## Layout — recursive, replaces the rowspan engine

Delete `src/lib/grid/layout.ts` (`buildLayout` rowspan) and rebuild `FlowGrid`/`GridCell` as
recursive `Box`/`Flow` React components mirroring `Box.svelte`/`Flow.svelte`:

- A box renders its content in its column and its children in a nested grid to the right; siblings
  stack; parent height grows with the subtree. No rowspan math.
- A **root with start column _k_** renders with _k_ leading blank grid cells in its band (the grid
  continues; left columns simply show empty bordered cells).
- **Navigation is column-aware**, generalizing the reference's level-based `getAdjacentBox`: a
  box's column = `startColumnOfRoot + depthFromRoot`; `↑/↓` move to the previous/next box occupying
  the **same column index** in vertical screen order, skipping `empty`.

## Editing & keys

Adopt the reference keymap above **verbatim**, wired through our existing command registry/keymap so
every binding stays remappable. Modeless editing is the default. All four arrows navigate boxes;
caret repositioning is mouse/click; `Cmd+A` selects within the focused box. Boxes are single-line
(strip newlines on input, mirroring `Text.svelte`).

**New-root-in-any-column** (the deviation) is exposed two ways:

- **Column header `+`** — clicking a speech column's header drops a `parentId:null` box in that
  column (discoverable; mirrors `Flow.svelte`'s per-column `addEmpty`, but creates a *real* root,
  not an `empty` chain).
- **A keyboard binding** — creates a root in the focused/empty column (fast, live-round friendly).

## Visual refresh (approved mock: `.superpowers/brainstorm/.../refresh-2.html`)

Excel-tight, in this app's restrained design tokens:

- **Cells share gridlines and directly border each other** — no horizontal gaps, no floating cards.
  Every grid position (including blanks and the extension) is a bordered cell.
- Restrained **blue = Aff / red = Neg** text color, no full-cell tints; thin gridlines.
- **Focus** = a colored ring + caret on the focused cell. **Conceded** = line-through.
  **Extension** = a normal cell carrying a small `↳` marker. **Folded** subtree = a collapsed chip.
- Per-column **headers** carry the speech label and the `+` add-root affordance.

The reference's structural cues (insert-bar lines, connected border-radii, per-level tint, anime.js
transitions) are *reinterpreted*, not copied — the Excel-tight gridline aesthetic replaces the
floating-card look.

## Overlays & the rest

- **Groups** and **cross-applications** (prior plans 2 & 3) remain additive overlays on the tree —
  unaffected by this rewrite.
- **Drop detection** stays computed/assist-only.
- **Export** must stop consuming `buildLayout`. Introduce one shared placement function
  `placeBoxes(tree) → { node, row, col, rowSpan }` derived from the recursive layout, consumed by
  both the screen renderer and the exporters (`src/lib/export/*`, `PrintView`) so PDF/XLSX match the
  screen exactly.

## Persistence & dead-code removal

- **Additive Dexie bump** defaulting `empty:false`, `isExtension:false` on existing rows; JSON
  export/import round-trips the new fields. Single-line tightening: on import, collapse any newlines
  in `text`.
- **Delete** `src/lib/grid/layout.ts` and the rowspan `FlowGrid`/`GridCell` internals once the
  recursive components land. The already-dead `src/lib/editor/*` box engine (noted in the prior
  spec) is removed if still present.

## Build order (for the implementation plan)

1. **Model + persistence** — add `empty`/`isExtension`; enforce single-line `text`; Dexie bump;
   JSON round-trip; `tree.ts` helpers (`addRoot(column)`, `addChildNextColumn`, `addExtensionChild`,
   `addEmptySpacer`). Pure, unit-tested.
2. **Recursive layout + placement fn** — `placeBoxes`; recursive `Box`/`Flow` components; column-
   aware navigation; delete `buildLayout`. Re-point exporters to `placeBoxes`.
3. **Keymap** — wire the full reference keymap through the command registry; modeless editing;
   roots-anywhere via header `+` and key.
4. **Visual refresh** — Excel-tight gridlines, focus/caret, conceded, extension cell, fold chip,
   headers, in this app's tokens.

## Testing

- **Model:** `empty`/`isExtension` round-trip through `tree.ts`/store/JSON; single-line enforcement
  strips newlines; child-column invariant (`child.speechId = parent + 1`); roots keep free column.
- **Navigation:** `↑/↓` move within a visual column skipping `empty` and crossing parent/sibling
  boundaries; `←` parent / `→` first child; edge fallbacks (top of column → parent/flow).
- **Creation:** `Enter` = sibling below; `Shift+Enter` = child in next column; `Cmd+E` = extension
  cell at child index 0; new-root lands in the chosen column with `parentId:null`.
- **Layout/export:** recursive placement parity — `placeBoxes` output drives both screen and
  exporters; folded subtrees collapse; desynced columns and the auto-push (next root flows below a
  subtree) render correctly.
- The demo flows in `docs/demo-flows/` remain the fidelity fixtures.

## Out of scope

- Importing the reference's `Root/Flow/Box` types, sharing/sync (urql/graphql), or anime.js
  transitions.
- Multi-line cells (explicitly retired — boxes are single-line).
- Multi-target responses and free-floating annotations (still deferred).
- Groups, cross-apps, and Phase-2 intelligence — unchanged, separate plans.
