# Export overhaul (JSON / Excel / PDF) — design

**Date:** 2026-06-05 **Status:** Approved for planning

## Goal

The flow editor has been substantially reworked (column-free tree, `columnsForSheet` per-sheet
column model, single-line cells, argument groups, merged group headers, drop detection, display
settings). The three exporters have drifted from this reality. This spec brings all three back in
sync and overhauls the PDF into a true print-quality artifact.

Three deliverables:

1. **JSON** — faithfully serialize the full current model, including all round metadata.
2. **Excel** — respect the user's display settings, notably argument numbering.
3. **PDF** — complete overhaul: a round-info cover page, then each sheet flowing across as many
   pages as it needs (no truncation), at full editor fidelity.

## Grounding: current state (verified in code 2026-06-05)

- **Display settings live in the store, not the `Round`.** `autoNumber` and `labelDrops` are in
  `useRoundStore` (persisted to localStorage). All three exporters take only `round`, so they
  currently cannot honor settings. `cells.ts buildExportSheets` always applies numbering.
- **Metadata is duplicated and `meta` is dead.** `Round` carries both `meta: RoundMeta` and
  `scouting: Scouting`, which overlap (tournament/judge/round/etc.). `createRound` is the only
  writer of `meta`, and it always passes `{}`. The entire app (RoundHeader, Excel Info sheet) reads
  `scouting`. `round.meta` is vestigial.
- **Export column model is out of sync with the editor.** `cells.ts` feeds raw `format.speeches`
  into `buildLayout`. The editor uses `columnsForSheet(format, sheet)` (honors per-sheet
  `startSpeechId`, drops leading columns) and `CX_COLUMNS` for CX sheets, plus merged headers for
  consecutive speeches sharing a `group`. Excel survives this by re-mapping each cell to the fixed
  template via `templateColumn(side, speechName)` (column index ignored). **The PDF uses the column
  index directly, so it is genuinely mis-columned** for any sheet with a non-default
  `startSpeechId`.
- **PDF is fixed-grid and lossy.** `pdf.ts` draws each sheet on exactly one landscape page with a
  fixed `ROW_H = 16`; long cells overrun/clip and a tall sheet is silently cut off. CX sheets run
  through the (wrong) flow layout. No round-info page.

## Decisions (resolved during design)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Metadata source of truth | **Merge `meta` into `scouting`.** `scouting` is canonical; remove `RoundMeta`/`round.meta`. |
| 2 | How settings reach exporters | **`ExportOptions` arg.** `downloadXlsx(round, opts)` / `downloadPdf(round, opts)`; `ExportMenu` reads the store and passes `{ autoNumber, labelDrops }`. Exporters stay pure. |
| 3 | Drops in exports | **PDF only.** PDF renders drop markers (gated by `labelDrops`); Excel skips drops. |
| 4 | PDF info page contents | **Everything available** (decision shown only when present). |
| 5 | Multi-page sheet continuation | **Repeat column headers only** (no "(cont.)" title). Rows never split across a page break. |
| 6 | PDF visual fidelity | **All of:** merged group headers, argument-group brackets, bold emphasis, numbering gated by `autoNumber` (plus existing conceded-strikethrough, extended-arrow, aff/neg colors). |
| 7 | CX sheets in PDF | **Dedicated CX layout** (period-paired Question/Response), mirroring the editor/Excel CX grid. |
| 8 | Dispatch structure | **Foundation first (sequential), then JSON/Excel/PDF in parallel.** |

Fixed defaults (not belabored): PDF stays **landscape US-letter**; pages ordered by `sheet.order`
after the info page. A single row taller than a full page is the one allowed exception to "rows
never split" — it starts a fresh page and may break across pages as a last resort.

---

## Task 0 — Foundation (sequential, must land before the others)

This task removes the cross-cutting collisions so JSON/Excel/PDF can proceed in parallel on a clean
base. It must be merged before dispatching Tasks 1–3.

### 0a. Merge `meta` into `scouting`

- Remove `RoundMeta` from `src/lib/model/types.ts` and the `meta` field from `Round`.
- Update `createRound` (`useRoundStore.ts`) to stop taking/writing `meta`; seed `scouting` with its
  existing defaults via `normalizeRound`.
- Update `normalizeRound` (`src/lib/model/normalize.ts`) to drop any legacy `meta` and ensure
  `scouting` is fully populated (it already normalizes scouting; confirm).
- Update `src/lib/persistence/io.ts`: remove the `r.meta` requirement from `importRoundJSON`
  validation; **on import, if a legacy file carries `meta` but thin `scouting`, fold known fields
  forward** (tournament/judge/round) so old saved rounds still load. Bump `FILE_VERSION` to `2` and
  accept v1 with the migration; reject anything else.
- Update `src/lib/persistence/autosave.ts` (drops the `meta` projection).
- Update `RoundSetup.tsx` caller.
- Grep for every `\.meta` / `RoundMeta` reference and resolve.

### 0b. `ExportOptions` plumbing

- Add `export interface ExportOptions { autoNumber: boolean; labelDrops: boolean }` (suggest
  `src/lib/export/options.ts` or co-locate in `cells.ts`).
- `buildExportSheets(round, opts)` — thread `opts` through. Numbering prefix in `cells.ts` becomes
  conditional on `opts.autoNumber` (still respecting per-node `numberOverride` via `numberFor`).
- `downloadXlsx(round, opts)`, `buildXlsx(round, templateBytes, opts)`,
  `downloadPdf(round, opts)`, `buildPdf(round, opts)` — accept and forward `opts`.
- `ExportMenu.tsx` — read `autoNumber` and `labelDrops` from the store and pass them into each
  exporter call.

### 0c. Sync the export column model with the editor

- In `cells.ts`, replace the raw `format.speeches` feed with the editor's column resolution:
  `columnsForSheet(format, sheet)` for flow sheets and `CX_COLUMNS` for `kind === "cx"` sheets
  (import from `src/lib/grid/columns.ts`). Feed those columns to `buildLayout`.
- `ExportCell.col` becomes an index into the sheet's **visible** columns (what the editor shows).
  Keep `speechName` on the cell (Excel relies on it; PDF uses `col`).
- Confirm Excel output is unchanged by this (Excel maps by `speechName`, so it should be); add/adjust
  a test asserting a sheet with a non-default `startSpeechId` exports identically in Excel.

### Tests / verification for Task 0
- Existing `io.test.ts`, `normalize.test.ts`, `autosave.test.ts`, `cells.test.ts`, `xlsx.test.ts`
  updated and green.
- New: round-trip a v1 (legacy `meta`) file → v2 with metadata preserved.
- New: `cells.ts` places a `startSpeechId` sheet's cells at editor-consistent column indices.

---

## Task 1 — JSON export (parallel, after Task 0)

Depends on Task 0a (metadata) + 0b (FILE_VERSION already bumped there).

- Verify `exportRoundJSON` serializes the **entire current `Round`**: `format`, `scouting` (now the
  single metadata home — tournament, round/label, date, judge, both schools, all four debaters,
  decision), `sheets` (incl. `kind`, `startSpeechId`), `nodes` (incl. `statuses`, `bold`,
  `numberOverride`), `groups`, `timers`. No field added in the editor rework may be silently dropped.
- The envelope is `{ version: FILE_VERSION, round }` — confirm `FILE_VERSION === 2`.
- `importRoundJSON` validates the v2 shape and round-trips losslessly. Add an explicit
  serialize→parse→deep-equal test covering a round that exercises groups, `numberOverride`,
  `startSpeechId`, CX nodes, and a full `scouting` block.
- **Out of scope:** display settings are *not* added to the JSON (they remain user/device prefs in
  localStorage). Document this choice in the file header so future readers don't "fix" it.

### Verification
- New round-trip test (above) green; `ExportMenu.test.tsx` JSON path green.

---

## Task 2 — Excel export (parallel, after Task 0)

Depends on Task 0b (`ExportOptions`) + 0c (column sync).

- Honor `opts.autoNumber`: when off, exported flow cells carry **no** numbering prefix; when on,
  numbering matches the editor (incl. `numberOverride`). This flows automatically from the
  `cells.ts` change in 0b — Task 2 verifies and tests it end-to-end through `buildXlsx`.
- Info sheet (`patchInfo`) already reads `scouting`; confirm it still maps every field after the
  metadata merge (tournament/judge/date/decision/RFD/schools/debaters).
- **Drops are out of scope for Excel** (`opts.labelDrops` is accepted but ignored here).
- No template/structural changes beyond numbering.

### Verification
- `xlsx.test.ts`: numbering on vs off produces cells with vs without the `N. ` prefix.
- Generated `.xlsx` still opens without Excel's repair dialog (existing invariants in
  `xlsxParts.test.ts` / `xlsx.test.ts` remain green).

---

## Task 3 — PDF export — complete overhaul (parallel, after Task 0)

Depends on Task 0b + 0c. This is a rewrite of `src/lib/export/pdf.ts`.

### 3a. Round-info cover page (page 1, always present)
Render from `scouting` (+ `format.name`, `role`). Include, omitting any empty field:
tournament, round/label, date (fall back to `createdAt`); aff & neg schools + team codes
(`teamCode`); all four debaters by position (1A/2A/1N/2N); decision (vote + RFD) **only if
present**. A clear title/header block at top.

### 3b. Flowing flow-sheet pages
Replace the fixed-grid drawing with a measured, paginating layout:

- **Columns:** use the sheet's visible columns (`columnsForSheet` via the Task-0c `ExportCell.col`),
  equal width across the landscape content area. Render **merged group headers** for consecutive
  speeches sharing a `group`. Aff columns blue, neg columns red (existing).
- **No truncation — rows grow.** Each cell wraps to as many lines as its text needs within its
  column width. The grid keeps the editor's leaf-row model (`buildLayout` `startRow`/`rowSpan`);
  each leaf-row gets a **measured height** so that every cell spanning it fits. A cell spanning
  multiple leaf-rows distributes its wrapped lines across its span. Compute cumulative y-offsets
  from these per-row heights rather than a constant `ROW_H`.
- **Pagination:** when the cumulative height exceeds the page body, break to a new page. **Rows
  never split** across a break (a whole leaf-row moves to the next page) — except a single row
  taller than a full page, which may break as a last resort. **Continuation pages repeat the
  speech-column headers** (no "(cont.)" title).
- **Fidelity decorations:** conceded → strikethrough (existing); extended → arrow prefix (existing);
  **bold nodes → bold font**; **argument-group brackets + labels** drawn alongside their column
  members; numbering prefix gated by `opts.autoNumber`.
- **Drops:** when `opts.labelDrops` is on, render a drop marker on dropped cells (mirror the
  on-screen `⚠ dropped` badge — compute via `detectDrops(nodes, format, sheetId)`).

### 3c. CX sheets — dedicated layout
For `sheet.kind === "cx"`, render the period-paired **Question/Response** layout (the four periods,
Q above/beside R) mirroring the editor's CX grid and the Excel CX sheet — **not** the flow layout.
Reuse the period/pairing logic from `xlsx.ts patchCx` (extract a shared helper if practical) to
read CX nodes (`cx-*-q` questions, `cx-*-r` response children). CX pages flow/paginate like flow
pages.

### 3d. Page order & edge cases
- Page 1 = info; then sheets by `sheet.order`. Empty rounds still produce the info page.
- A sheet with zero nodes still gets a page with its headers.

### Verification
- `pdf.test.ts`: extend to assert page count grows with content (a tall sheet → multiple pages);
  info page present; a non-default `startSpeechId` sheet columns match the editor; CX renders via the
  CX path. (PDF tests assert on structure/page count/embedded text, not pixels.)
- Manual: open a real multi-sheet round PDF; confirm no clipping, headers repeat, groups/bold/drops
  render, numbering toggles with the setting.

---

## Dispatch summary

```
Task 0 (Foundation) ──► merge; then in parallel:
   ├─ Task 1 (JSON)
   ├─ Task 2 (Excel)
   └─ Task 3 (PDF)
```

Task 0 is sequential and blocking. Tasks 1–3 share no files once Task 0 lands (JSON → io/persistence;
Excel → xlsx*; PDF → pdf.ts; each touches only its own `ExportMenu` call site, already wired in 0b).
```
