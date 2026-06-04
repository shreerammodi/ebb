# Comprehensive export system — design

**Date:** 2026-06-02 **Status:** Approved for planning

## Goal

Replace the single **Export** button (currently JSON-only) with an **export menu** offering three
formats:

- **JSON** — the app's own round file (already implemented; just moves into the menu).
- **Excel** — a populated copy of the user's own macro-enabled policy template, `Flow.xltm`.
- **PDF** — a real downloadable `.pdf` of the flow.

The header reorganizes to `[ Export ▾ ] [ Import ] [ New round ]`. The standalone **Print** button
is removed — the PDF item supersedes it. **Import** stays a sibling button.

## Locked decisions (from brainstorming)

1. **Policy-only app.** The app supports exactly one event, policy debate. The 7 policy speech
   columns (`1AC / 1NC / 2AC / Block / 1AR / 2NR / 2AR`) are always THE columns. LD is just a user
   convention of ignoring the `2NR`/`2AR` columns — exports never branch on format. So the Excel
   template's columns always map 1:1 to the app's columns; there is no format-mismatch case.
2. **Excel preserves macros.** Output is a macro-enabled `.xlsm` produced by editing the template's
   OOXML zip in place (inject values, repackage). No JS spreadsheet library can retain VBA, so we do
   not use one for Excel. The `vbaProject.bin` and exact styling survive.
3. **Excel populates the full flow, laid out.** For each app flow sheet we clone the matching
   AFF/NEG template sheet, name it after the sheet, and place every argument's text in its speech
   column at the row computed by the app's existing grid layout, so clashes line up vertically.
   Decorations map over (`crossed`→strikethrough, `isExtension`→arrow, `bold`→bold).
4. **Keep the hidden AFF/NEG templates AND add populated visible sheets.** The hidden template
   sheets stay intact so the workbook's macros still work; populated sheets are added alongside.
5. **PDF is a real generated file.** Drawn with a PDF library (one-click `.pdf` download), not the
   OS print dialog.
6. **Best-effort Info metadata.** The app's `RoundMeta` is thinner than the template's Info fields;
   unmapped Info cells stay blank.

## The model this targets

The **live app runs on the old `src/lib/model/` model** (`Round` + `ArgumentNode[]`), rendered
through the elastic rowspan grid. The in-progress editor rework (`src/lib/editor/`, `Box` tree) is
**not yet wired into the store/UI**, so this export system reads the old model. If/when the editor
rework lands, the exporters move with the renderer (they consume the same shared layout).

Relevant shapes (`src/lib/model/types.ts`):

- `Round { meta: RoundMeta; format: Format; sheets: Sheet[]; nodes: ArgumentNode[]; createdAt; ... }`
- `Sheet { id; title; group: 'aff'|'neg'; order }`
- `ArgumentNode { id; sheetId; speechId; parentId; order; text; statuses: ('conceded'|'extended')[]; numberOverride? }`
- `Speech { id; name; side; seconds; group? }`. The policy preset models the neg block as a single
  speech **named `Block`** (no `2NC`/`1NR` split, no `group` used), so the speech→column mapping is
  a direct **name match** to the template headers.
- `RoundMeta { tournament?; roundLabel?; judge?; affName?; negName?; opponent? }`

## The `Flow.xltm` template (verified)

A macro-enabled (`.xltm`, with `xl/vbaProject.bin`) workbook with five sheets:

| Sheet       | sheetId | Role                                                                                   |
| ----------- | ------- | -------------------------------------------------------------------------------------- |
| `Info`      | 1       | Metadata: schools, debater names, tournament, round, date, judges, vote, decision, RFD |
| `AFF`       | 3       | **Hidden** aff flow template — 7 cols `A–G`: `1AC,1NC,2AC,Block,1AR,2NR,2AR`           |
| `NEG`       | 21      | **Hidden** neg flow template — 6 cols `A–F`: `1NC,2AC,Block,1AR,2NR,2AR`               |
| `Decisions` | 48      | Decisions sheet (left as-is)                                                           |
| `CX`        | 35      | Cross-ex sheet (left as-is)                                                            |

Both flow templates freeze below row 2 (`pane ySplit="2"`, body starts at row 3); each column is ~21
wide; per-column cell styles alternate (odd/even). Speech-name labels live in `sharedStrings.xml`.

### Info sheet cell map (for population)

Verified cell anchors on `Info` (sheet1):

- `D5:E5` AFF School · `H5:I5` NEG School
- `D8:E8` 1A first/last · `H8:I8` 1N first/last
- `D9:E9` 2A first/last · `H9:I9` 2N first/last
- `D11:E11` Tournament · `D12:E12` Round · `D13:E13` Date

The app→template metadata mapping is best-effort: `meta.tournament`→`D11`, `meta.roundLabel`→`D12`,
date from `round.createdAt`→`D13`. Names/schools populate where present; everything unmapped stays
blank.

## Architecture

```
RoundHeader ─ ExportMenu ─┬─ exportJson   reuse src/lib/persistence/io.downloadRoundFile
                          ├─ exportXlsx   template zip-surgery → .xlsm
                          └─ exportPdf    pdf-lib → .pdf
                                 │
                          src/lib/grid/layout.ts  ← buildLayout extracted here (shared)
```

New code under `src/lib/export/`. Each exporter is a pure function of the live `Round` that produces
a `Blob` and triggers a download via a shared browser helper.

### Shared layout extraction (targeted refactor)

`buildLayout(nodes, speeches) → { placed: PlacedNode[]; totalRows }` currently lives **inside**
`src/components/FlowGrid.tsx`. Extract it (and the `PlacedNode` type) into a pure
`src/lib/grid/layout.ts` with no behavior change; `FlowGrid` imports it back. Both exporters then
place nodes identically to the on-screen grid. `PlacedNode` carries
`{ node, startRow, rowSpan, col }`.

### Speech → template column mapping

A pure helper maps each app speech onto the template's fixed column headers by **name** (e.g.
`Block` is one speech matching the `Block` column). AFF sheets use the 7-column header set
(`1AC,1NC,2AC,Block,1AR,2NR,2AR`), NEG sheets the 6-column set (`1NC,2AC,Block,1AR,2NR,2AR`). For a
policy round this mapping is total; the helper returns a clear error if a speech name fails to
resolve (e.g. a non-policy round), surfaced via the standard alert.

### Excel exporter (`exportXlsx.ts`)

1. `fetch('/templates/Flow.xltm')` → `ArrayBuffer`; unzip with `fflate`.
2. **Info:** patch metadata cells (above) by rewriting their `<c>`/`<v>` (inline values, not shared
   strings, to avoid index churn).
3. **Flow sheets:** for each `round.sheets` (sorted by `order`):
   - Clone the AFF worksheet XML if `sheet.group==='aff'`, else NEG.
   - Allocate a fresh `sheetId`, `r:id`, and `xl/worksheets/sheetN.xml` part; set the tab name to
     `sheet.title`; make it visible (no `state="hidden"`).
   - For each node on the sheet, write `node.text` into the cell at
     `(col from speech mapping, row 3 + placed.startRow)`. Generate rows beyond the template's
     pre-styled range by copying the per-column cell style. Decorations: `statuses` includes
     `conceded`→strikethrough style, `extended`→arrow glyph prefix, evidence/`bold`→bold style.
     (`bold` is an editor-model concept; under the old model, evidence/bold is not yet a field —
     placement uses what the old model exposes, and the decoration hooks are written so the
     editor-model fields slot in later.)
   - Numbering is a computed overlay (`src/lib/model/numbering.ts`); prefix cell text with the
     display number to match the on-screen flow.
4. Register each new sheet in `workbook.xml` (`<sheets>`), `xl/_rels/workbook.xml.rels`, and
   `[Content_Types].xml`. Keep the hidden `AFF`/`NEG` template sheets intact. Flip the workbook main
   content-type from template→workbook and delete `xl/calcChain.xml` (plus its content-type override
   and rel) so Excel rebuilds it and opens the file cleanly.
5. Re-zip with `fflate`; download as `debate-flow-<role>-<YYYYMMDD>.xlsm` (reuse the existing
   filename/sanitize helpers from `io.ts`).

### PDF exporter (`exportPdf.ts`)

Use `pdf-lib`. Per sheet (sorted by `order`), one landscape page scaled to fit:

- Draw a header row of speech names (blue = aff, red = neg, matching the reserved palette).
- For each `PlacedNode`, draw a cell box at the row/column from `buildLayout` with wrapped text.
- Decorations: strikethrough = a drawn line; extension = an arrow glyph; bold/evidence = bold font;
  numbering prefix from the numbering overlay.
- Download `debate-flow-<role>-<YYYYMMDD>.pdf`.

### Menu UI (`ExportMenu`)

A small dropdown anchored under the **Export** button, styled to match the existing `actionBtn`
(light mode, no color tints beyond the palette). Three items: **JSON**, **Excel**, **PDF**.
Keyboard-navigable; closes on select, `Escape`, or outside click. `RoundHeader` loses the standalone
Print button; Import and New round remain.

## Asset & dependencies

- Move `Flow.xltm` → `public/templates/Flow.xltm` (served statically, fetchable at runtime).
- Add `fflate` (zip/unzip) and `pdf-lib` (PDF). Both are tiny, MIT, browser-first, no native builds
  — consistent with the local-first ethos.

## Error handling

Template-fetch and generation failures surface a non-blocking `alert` (same pattern as the existing
import error in `RoundHeader`) and never crash the app. Exports are read-only over store state.

## Testing

- **Pure unit tests:** extracted `buildLayout` (behavior parity), speech→column mapping (incl. the
  Block group), Info cell-patch helpers, filename builder, decoration→style/glyph mapping.
- **Excel structural tests:** the produced `.xlsm` is a valid zip; contains one visible sheet per
  app sheet plus the retained hidden templates; patched Info cells and node text appear in the right
  worksheet/cells; the main content-type is the workbook (not template) type; `calcChain.xml`
  removed.
- **PDF structural tests:** produced bytes are a valid PDF with the expected page count (one per
  sheet).
- **UI test:** the export menu opens and each item invokes the corresponding exporter (mocked).

## Out of scope

- The `Decisions` and `CX` template sheets are passed through unchanged (not populated).
- No new metadata fields are added to `RoundMeta` to fill more Info cells — best-effort only.
- No round-trip Excel/PDF _import_; these are export-only.

```

```
