---
target: src/components/FlowGrid.tsx
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-06-24T08-57-07Z
slug: src-components-flowgrid-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Drag fully communicates: drop-target highlight, source lift, reparent confirm flash. |
| 2 | Match System / Real World | 4 | Fluent debate vocabulary (speeches, sides, numbering, drops, CX). |
| 3 | User Control and Freedom | 3 | Drag has feedback; still no in-grid undo and no keyboard reparent path. |
| 4 | Consistency and Standards | 4 | One class/token vocabulary; easing promoted to --ease-out-quart. |
| 5 | Error Prevention | 3 | Drop-target preview helps; backspace-deletes-empty is immediate, no undo. |
| 6 | Recognition Rather Than Recall | 3 | Persistent-faint +, interactive empty cells, first-run hint. |
| 7 | Flexibility and Efficiency | 4 | Keyboard-first, straight-down, drag, click-to-add. |
| 8 | Aesthetic and Minimalist Design | 4 | Distill removed em-dash noise; pristine, on-brand density. |
| 9 | Error Recovery | 3 | Confirm flash, but no undo of a wrong reparent at this layer. |
| 10 | Help and Documentation | 3 | SR caption describing structure + first-run hint. |
| **Total** | | **35/40** | **Good (top of band)** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** Unchanged verdict, now with less noise. Detector `detect.mjs` on `FlowGrid.tsx` + `GridCell.tsx` returns `[]` (zero findings). Distinctive dense-table instrument, reserved semantic color, mono headers, tokenized motion. Passes first- and second-order category-reflex. The em-dash void field that added visual noise is gone; the surface is cleaner than at the 32 baseline.

No visual overlay this run: `FlowGrid` renders nothing without a seeded round, so browser injection was skipped (consistent with the baseline critique). Static layer covered by detector; behavior covered by the 442-test suite.

## Overall Impression

The arc moved the surface from "confident but with invisible mouse affordances and a keyboard-focus bug" to "confident, discoverable, and accessible." The biggest gains are exactly where the 32 baseline was weakest: drag now has real state feedback, the add affordances are visible, and screen-reader structure exists. What's left is a coherent theme rather than scattered defects: **the keyboard-first promise is not yet complete for structural edits**, and **touch/responsive is untouched**. Those are the next frontier, not polish.

## What's Working

- **Drag is now legible.** Drop-target dashed-violet highlight (distinct from the solid selection outline), a dim-to-0.4 lift on the dragged argument, and a one-shot violet pulse confirming where it landed. The "reparent commits blind" gap from baseline is closed, with reduced-motion handled.
- **Accessibility caught up to the brand.** `scope="col"`/`scope="colgroup"`, an sr-only `<caption>`, the keyboard-focus fix on `+`, and a first-run hint that holds WCAG AA (no opacity dimming). Color-blind safety was already good; SR structure now matches.
- **Discoverability without chrome.** The faint persistent `+`, the `cell-open` hover affordance, and the single contextual hint make the entry point findable while keeping the "invisible tool" feel mid-round.

## Priority Issues

- **[P2] Structural edits are mouse-only.** Drag-to-rehome/reparent now has lovely feedback, but there's still no keyboard path to restructure the tree. For a tool whose headline value is keyboard-first operability, restructuring being pointer-only is the standout remaining gap.
  - **Why it matters**: A keyboard/SR user can add and edit but cannot reparent; the flow's tree is half-editable without a mouse.
  - **Fix**: A keymap command to reparent the selected node (e.g. "set parent = cell to the left" or a pick-target mode), reusing `setNodeParent`/`rehomeNode`.
  - **Suggested command**: `$impeccable shape` (design the interaction), then build.

- **[P2] No touch / responsive strategy.** `table-layout: fixed` with no overflow handling; the `+` and cells are below 44×44px touch targets; the faint `+` has no touch reveal.
  - **Why it matters**: On a tablet or narrow laptop the grid likely overflows or crushes columns, and touch users can't comfortably hit controls.
  - **Fix**: Horizontal-scroll container with sticky first column, or a responsive column strategy; enlarge touch targets at coarse-pointer breakpoints.
  - **Suggested command**: `$impeccable adapt`

- **[P2] At-rest reachability is now invisible (distill tradeoff).** With the em-dash gone, a reachable empty cell and an unreachable void look identical until hover. Keyboard and touch users get no at-rest cue of the flow's reachable "staircase."
  - **Why it matters**: New users can't see where responses may go without hovering each cell.
  - **Fix**: A whisper-faint neutral tint on `.cell-void` (a "locked cell" look) restores the cue without bringing back the misreadable glyph.
  - **Suggested command**: `$impeccable colorize` (or a one-line CSS tweak).

- **[P3] No undo surfaced at the grid layer.** Reparent and backspace-delete commit immediately; the confirm flash acknowledges but offers no take-back. If the store supports undo, it isn't reachable/visible here.
  - **Why it matters**: A mis-drop or accidental delete has no obvious recovery in-grid.
  - **Fix**: Surface undo (toast action or documented keymap) for structural edits.
  - **Suggested command**: `$impeccable harden`

- **[P3] px type scale.** The grid sizes type in px throughout, which doesn't honor user zoom/font-size settings.
  - **Why it matters**: Low-vision users who raise their base font size see no change in the grid.
  - **Fix**: Convert the grid's type ramp to a rem scale in one dedicated pass.
  - **Suggested command**: `$impeccable typeset`

## Persona Red Flags

**Alex (Power User)**: Drag feedback now satisfying. Wants a keyboard reparent (P2) and bulk ops; still absent.

**Sam (Accessibility-Dependent)**: Big gains — caption, scope, focus-visible `+`, AA-safe hint, color-blind-safe sides. Remaining: no keyboard reparent (P2), empty cells still click-only `<td>`, and at-rest reachability cue is gone (P2).

**Jordan (First-Timer)**: Visible `+`, interactive cells, and a first-run hint now guide the start. Remaining: the hint is a single narrow cell, easy to miss; once typing begins there's no further coaching.

## Minor Observations

- The drag-over highlight and `cell-open` hover use slightly different wash strengths (8% vs 6% of `--sel`). Intentional-feeling, but could be unified to one token if more washes appear.
- `--ease-out-quart` is now the single motion curve; if entrance/exit motion grows, add the quint/expo companions rather than re-inlining beziers.
- Dropped cell still trades its side left-edge for the amber dash — now a documented, deliberate decision.

## Questions to Consider

- What's the keyboard gesture for reparenting that fits the existing keymap without colliding (a "grab/move" mode, or directional set-parent)?
- Is the flow grid expected to be usable on a tablet at a tournament, or is it laptop-only? That answer decides how much the responsive/touch P2 matters.
- Should a mis-drop be undoable, or is the confirm flash plus easy re-drag enough recovery for a secondary action?
