# Flow Straight Down — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Summary

Add a global display setting, **"Flow straight down"**, that makes the flow behave
like a plain spreadsheet (Excel-style): cells are just cells. When enabled:

- Pressing **Enter** in a column spawns a new cell directly below the current one.
- Argument **"responses"** (the cross-column, parent→child linking) are **not
  enabled** — you cannot create new responses.

The setting is non-destructive: it changes future input behavior only. Existing
parent-child links and their connectors continue to render and export as before.

## Motivation

The current model is response-tree oriented: arguments link to answers in opposing
speech columns, which drives numbering, drop detection, and connectors. Some users
want a simpler, flat mental model where each column is just a stack of cells —
"akin to the default behavior in Microsoft Excel, where cells are just cells."

## Setting

- New global display boolean **`straightDown`**, default `false`.
- Lives alongside `autoNumber` / `labelDrops` in `useRoundStore` state.
- New action `setStraightDown(v: boolean)`, mirroring `setAutoNumber` (updates state
  and persists all three display flags).
- Threaded through the `DisplaySettings` interface and `load/saveDisplaySettings`
  (localStorage key `df-display-settings`); on load, default to `false` when absent
  so existing users are unaffected.
- Surfaced as a third toggle in `SettingsPanel`'s **Display** category, labeled
  **"Flow straight down"**.

## Behavior when `straightDown` is on

### 1. Enter creates a root cell below (flow sheets only)

`node.addAnswer` (Enter; vim `o`): create the new cell with `parentId: null` instead
of inheriting `node.parentId`. `insertAfterOrder: node.order` is unchanged, so the
new cell lands directly below the current one. Applies to flow sheets only — CX
nodes are already roots, so CX is effectively untouched.

### 2. Responses disabled (flow sheets only)

`node.answerAcross` (Shift+Enter; vim `a`): becomes a no-op **on flow sheets**.

CX sheets are **unaffected**: on CX sheets `node.answerAcross` is how you move from a
question column to its response column (`responseColumnFor`). The gate is therefore
`straightDown && !isCxSheet(round, node.sheetId)` — straight-down applies to the
normal flow only, never to CX sheets.

### 3. Auto-numbering stays dead (no code change)

`numberFor` returns `null` for root nodes. In straight-down mode every cell is a
root, so no cell is numbered, regardless of the "Auto-number arguments" toggle. This
is the intended behavior — no change to `numbering.ts`.

### 4. Drop detection suppressed

`detectDrops` defines a "drop" in terms of the response tree (an unanswered node).
With no responses, every node with later opposing content would be flagged — pure
noise. So when `straightDown` is on, drop detection yields nothing:

- `FlowGrid.tsx` `droppedIds` returns an empty set (alongside the existing `isCx`
  guard).
- The `selectSheetDropCount` selector (`useRoundStore.ts`) returns `0` / empty.

`GridCell` and `Sidebar` derive their drop UI from these, so no further changes are
needed there.

### 5. Display panel reflects the dead toggles

When `straightDown` is on, the **Auto-number arguments** and **Label drops** toggles
are rendered `disabled` (greyed out), with a short hint that they're unused while
flowing straight down. Their stored values are preserved and snap back when
straight-down is turned off.

## Non-goals

- **No numbering generalization.** Straight-down cells are not sequentially numbered;
  numbering stays root-less and dead.
- **No CX flattening.** CX sheets keep their current Q→Response behavior.
- **No conditional cheatsheet.** The keybindings cheatsheet remains a static
  reference; it will not mark Shift+Enter / answer-across as disabled.
- **No data migration.** Existing parent-child links, connectors, and xlsx export
  connectors keep rendering normally; turning the setting on/off never mutates nodes.

## Files touched

- `src/lib/store/useRoundStore.ts` — `straightDown` state, `setStraightDown` action,
  `DisplaySettings` field + load/save defaults, `selectSheetDropCount` gate.
- `src/lib/commands/commands.ts` — `node.addAnswer` root-cell gate; `node.answerAcross`
  no-op gate (flow sheets only).
- `src/components/FlowGrid.tsx` — `droppedIds` gate.
- `src/components/SettingsPanel.tsx` — new "Flow straight down" toggle; disable
  Auto-number / Label-drops toggles when straight-down is on.
- Tests: store (setter + persistence of all three flags, drop selector gate),
  commands (addAnswer produces a `parentId: null` cell below; answerAcross no-op on
  flow sheets but unchanged on CX), and SettingsPanel (toggle present; the two
  dependent toggles disabled when straight-down is on).

## Testing strategy

- **Store unit tests:** `setStraightDown` updates state and persists `{ autoNumber,
  labelDrops, straightDown }`; `loadDisplaySettings` defaults `straightDown` to
  `false` when absent. `selectSheetDropCount` returns 0 when `straightDown` is on.
- **Command unit tests:** with `straightDown` on, `node.addAnswer` on a child node
  yields a new node with `parentId: null` ordered directly after the selection;
  `node.answerAcross` is a no-op on a flow sheet but still creates the response on a
  CX sheet.
- **Component tests:** Display category shows the new toggle; toggling it on disables
  the Auto-number and Label-drops switches.
