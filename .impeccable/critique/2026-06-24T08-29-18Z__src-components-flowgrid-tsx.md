---
target: src/components/FlowGrid.tsx
total_score: 32
p0_count: 0
p1_count: 1
timestamp: 2026-06-24T08-29-18Z
slug: src-components-flowgrid-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Selection/insert/extended/conceded all read clearly; drag has no drop-target feedback. |
| 2 | Match System / Real World | 4 | Speech names, sides, response numbering, drops, CX columns — fluent debate vocabulary. |
| 3 | User Control and Freedom | 3 | Drag-to-rehome + backspace-deletes-empty work; no in-grid undo/Esc affordance shown. |
| 4 | Consistency and Standards | 4 | One class vocabulary, one cell renderer, reserved color system applied uniformly. |
| 5 | Error Prevention | 3 | Backspace-deletes-empty is safe; drag-reparent commits silently with no preview. |
| 6 | Recognition Rather Than Recall | 2 | The only mouse "add" affordance is a `+` at opacity:0 until header hover; empty cells don't look clickable. |
| 7 | Flexibility and Efficiency | 4 | Keyboard-first, straight-down mode, drag-drop, click-to-add, global keymap. |
| 8 | Aesthetic and Minimalist Design | 4 | Dense, gridded, instrument-like. No decoration. Genuinely on-brand. |
| 9 | Error Recovery | 3 | Little recovery surface at this layer; drag gives no "where will it land". |
| 10 | Help and Documentation | 2 | No inline hints/empty-state guidance in the grid itself. |
| **Total** | | **32/40** | **Good** |

## Anti-Patterns Verdict

**Does this look AI-generated? No — emphatically.** This is a purpose-built instrument, not a template. Dense `<table class="flow">` at 12.5px, mono uppercase tracked column headers, reserved semantic color (blue=Aff, red=Neg, violet=selection, amber=drop), Excel-tight gridlines. It passes both the first-order category reflex (nobody guesses "debate tool" → this) and the second-order one. No card grids, no gradient text, no eyebrows, no hero metric.

**Deterministic scan**: `detect.mjs` on `FlowGrid.tsx` + `GridCell.tsx` returned `[]` — zero findings. Clean static layer.

**Note on the side-stripe ban**: `.flow td.side-aff { border-left: 2px solid }` is *not* the banned decorative side-stripe. It's a weighted gridline inside a fully-bordered table that encodes column side, redundant with header label + colored text + column position. Defensible. One wrinkle: `.cell-drop` overrides that left edge with amber-dashed, so on a dropped cell the side no longer reads from the left border (it survives via text color only).

## Overall Impression

This is a confident, distinctive surface that already nails the "fast, precise, invisible" brief. The grid disappears into the task exactly as intended. The weaknesses are not aesthetic — they're discoverability and keyboard-focus parity around the *mouse* affordances, plus two legibility nits. The single biggest opportunity: the mouse paths for adding and rehoming arguments are nearly invisible, and the keyboard-focus story on the `+` button actively contradicts the stated "full keyboard operability" requirement.

## What's Working

- **Reserved, meaningful color that passes contrast.** Aff `#1d4ed8` ≈ 6.7:1 and Neg `#c0271f` ≈ 5.9:1 on white both clear WCAG AA for small text. Side is encoded redundantly (text color + left border + header label + column position), so it survives color-blindness and the red/blue pairing avoids the red/green trap. This is the principle "reserved, meaningful color" executed correctly.
- **The cell IS the box.** The borderless auto-growing textarea (`.cell-input`) editing in place with no layout shift is excellent craft — editing causes zero reflow, matching font and line-height exactly. Instrument-grade.
- **Density without clutter.** 12.5px body, tight rowspans, mono headers. Aesthetic/minimalist is a genuine 4; every element earns its pixel.

## Priority Issues

- **[P1] The `+` add button is invisible to keyboard focus.** `.th-add` is `opacity:0`, raised only by `.flow th:hover`. Keyboard `Tab` to the button never triggers the hover, so a keyboard user lands a `:focus-visible` ring around an opacity-0 element — a focus ring around nothing. This directly violates the PRODUCT.md "full keyboard operability" requirement.
  - **Why it matters**: Keyboard-first is your core product value; the primary mouse-add affordance is unusable and confusing for keyboard users.
  - **Fix**: Add `.th-add:focus-visible { opacity: 1 }` (and consider `th:focus-within .th-add`). Cheap, one line in `globals.css`.
  - **Suggested command**: `$impeccable audit`

- **[P2] No mouse-discoverable way to add a first argument.** The two add paths are both hidden: the `+` is opacity-0 until header hover, and empty cells are bare `<td onClick>` with no cursor/hover/visual cue that they're clickable. A first-timer (Jordan) sees a grid with no visible "add" affordance at all.
  - **Why it matters**: New debaters can't find the entry point; discoverability is near zero without reading docs.
  - **Fix**: Give accessible empty cells a hover affordance (subtle bg tint + `cursor: text` or a ghost `+`), and/or keep the header `+` faintly visible (opacity ~0.35) rather than fully hidden.
  - **Suggested command**: `$impeccable onboard`

- **[P2] Drag-to-rehome has zero feedback.** Empty cells and node spans `preventDefault` on `dragover` but nothing highlights a valid drop target or previews the new parent. Dropping silently calls `rehomeNode`/`setNodeParent`.
  - **Why it matters**: Reparenting an argument is a structural edit; committing it blind invites mistakes with no preview and (at this layer) no visible undo.
  - **Fix**: Add a `drag-over` target style (outline/bg on the hovered cell), and a brief toast or highlight confirming the rehome. Standard drag affordances, not invented ones.
  - **Suggested command**: `$impeccable animate`

- **[P2] The "dropped" badge is 8px — the most important status in the smallest type.** A dropped argument is often the round-winning fact, yet `.badge-drop { font-size: 8px }` renders it below legible threshold, uppercase.
  - **Why it matters**: Visibility of status is inverted to importance; debaters scanning for drops under time pressure will miss them.
  - **Fix**: Bump to ~10–11px, lean on the amber border + `#fff7ed` fill for compactness. Verify the amber `#b45309` clears AA at the new size.
  - **Suggested command**: `$impeccable typeset`

- **[P2] Table semantics are thin for screen readers.** No `scope` on `<th>`, no `<caption>`, and a two-row header (group row + speech row) with body rowspans. Screen-reader header association is ambiguous.
  - **Why it matters**: Sam (keyboard/SR user) can't reliably tell which speech/side a cell belongs to. Undercuts the accessibility commitments in PRODUCT.md.
  - **Fix**: `scope="col"` on speech `<th>`, `scope="colgroup"` on group headers, an sr-only `<caption>` naming the sheet. Empty `<td onClick>` cells should expose a keyboard/role path or be documented as keyboard-only-via-keymap.
  - **Suggested command**: `$impeccable audit`

## Persona Red Flags

**Alex (Power User)**: Mostly happy — keyboard-first, straight-down mode, drag-drop, instant inline edit. Friction: backspace-deletes-empty-node is undocumented in-grid (powerful once learned, surprising once). No visible bulk affordance for multi-cell ops at this layer.

**Sam (Accessibility-Dependent)**: Focus ring around the opacity-0 `+` button (P1). No `th` scope / caption (P2). Empty cells are click-only `<td>` (P2). Side encoded by color *plus* position/label/border, so color-blindness is handled well — the one place a11y is clearly ahead.

**Jordan (First-Timer)**: No visible "add argument" affordance (P2). No empty-state coaching when a sheet is blank. The em-dash `—` voids may read as content, not "unavailable." Will hesitate at "how do I start."

## Minor Observations

- **Void em-dash field**: sparse sheets paint many `.dash` `—` placeholders at `--muted`/0.6 opacity. Low contrast, and `—` is itself a real debate annotation, so it can be misread as content. Consider rendering inaccessible cells as truly empty (gridline only) or a non-glyph texture.
- **Dropped cell loses its side edge**: `.cell-drop` `!important` left-border replaces the side color's left border; side then reads from text color only. Acceptable, worth a deliberate decision.
- **All body text inherits side color**: `.flow td.side-aff { color }` colors every word in a column blue/red. It passes AA and encodes side, but the high-contrast near-black `--ink` is never used for content; over a long round, full-column colored text is heavier than header+border+number coloring would be.

## Questions to Consider

- Should the mouse-add affordance be *discoverable by default* (faint persistent `+`, clickable-looking empty cells) without compromising the "invisible tool" aesthetic mid-round?
- If side is already encoded by position + header + left border, does coloring the entire argument body text earn its weight, or would near-black body + colored accents read cleaner across a full sheet?
- Is drag-to-rehome a primary path worth investing feedback in, or a secondary convenience that should defer to a keyboard reparent command?
