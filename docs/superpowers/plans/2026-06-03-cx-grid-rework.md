# CX Grid Rework Implementation Plan

> Supersedes the bespoke CX work (original plan Tasks 15/16/18). Reuses the flow-grid engine: CX cells become real `ArgumentNode`s on a fixed CX column set; the `round.cx` model and `CxSheet` component are removed. See spec "Task 6 — REVISED".

**Goal:** Make the CX sheet a flow-grid-like table (same nav/edit/undo/keymap) with Question/Response columns grouped per CX period, minus drop/extend/numbering, as its own pinned sidebar section.

**Tech Stack:** Next.js, React, TS, Zustand, Vitest.

**Test cmd:** `npx vitest run <path>`; full: `npx vitest run`.

---

## R1: CX column definitions
**Files:** Create `src/lib/model/cxColumns.ts`, `src/lib/model/cxColumns.test.ts`.

`CX_COLUMNS: Speech[]` — 8 entries, stable ids, grouped per period; Q = questioner side (opponent of the named speech), R = answerer side:
```ts
import type { Speech } from './types';
export const CX_COLUMNS: Speech[] = [
  { id: 'cx-1ac-q', name: 'Question', side: 'neg', seconds: 0, group: '1AC CX' },
  { id: 'cx-1ac-r', name: 'Response', side: 'aff', seconds: 0, group: '1AC CX' },
  { id: 'cx-1nc-q', name: 'Question', side: 'aff', seconds: 0, group: '1NC CX' },
  { id: 'cx-1nc-r', name: 'Response', side: 'neg', seconds: 0, group: '1NC CX' },
  { id: 'cx-2ac-q', name: 'Question', side: 'neg', seconds: 0, group: '2AC CX' },
  { id: 'cx-2ac-r', name: 'Response', side: 'aff', seconds: 0, group: '2AC CX' },
  { id: 'cx-2nc-q', name: 'Question', side: 'aff', seconds: 0, group: '2NC CX' },
  { id: 'cx-2nc-r', name: 'Response', side: 'neg', seconds: 0, group: '2NC CX' },
];
export const CX_COLUMN_IDS = new Set(CX_COLUMNS.map(c => c.id));
/** The Response column paired with a Question column id, or null. */
export function responseColumnFor(questionColumnId: string): string | null {
  const i = CX_COLUMNS.findIndex(c => c.id === questionColumnId);
  if (i === -1 || !questionColumnId.endsWith('-q')) return null;
  return CX_COLUMNS[i + 1]?.id ?? null;
}
```
Also a sheet-aware column resolver (put here or in a tiny module):
```ts
import type { Round } from './types';
export function columnsForSheet(round: Round, sheetId: string): Speech[] {
  const sheet = round.sheets.find(s => s.id === sheetId);
  return sheet?.kind === 'cx' ? CX_COLUMNS : round.format.speeches;
}
```
Tests: 8 columns; groups paired; `responseColumnFor('cx-1ac-q') === 'cx-1ac-r'`; `responseColumnFor('cx-1ac-r') === null`; `columnsForSheet` returns CX cols for a cx sheet, format speeches otherwise.

## R2: FlowGrid/GridCell render CX via columnsForSheet; Workspace routes CX→FlowGrid
**Files:** `src/components/FlowGrid.tsx`, `src/components/GridCell.tsx`, `src/components/Workspace.tsx`; tests.
- FlowGrid: replace `const speeches = format.speeches` with `const speeches = columnsForSheet(round, sheetId)` (subscribe `round` or pass columns). Group-header logic already keys off `speech.group` → CX period headers render automatically. Determine `isCx = activeSheet.kind === 'cx'`; pass `isCx` to GridCell; when `isCx`, `droppedIds = new Set()` (skip detectDrops).
- GridCell: accept `isCx?: boolean`. When true, suppress the `arg-num` number and the conceded/extended/drop badges (render only the text + editing).
- Workspace: route cx sheets to `<FlowGrid sheetId={...} />` (REMOVE `<CxSheet />`). The existing auto-select effect already guards cx (early return) — keep, but if it sorts by `format.speeches`, make it use `columnsForSheet`.
- Tests: a cx sheet renders the four period group headers (`1AC CX`…); a node placed in `cx-1ac-q` shows no number/badges even when `autoNumber` on.

## R3: Commands CX-aware
**Files:** `src/lib/commands/commands.ts`; tests.
- `node.answerAcross`: if the selected node is on a cx sheet, target column = `responseColumnFor(node.speechId)` (no-op if null, e.g. already a Response); else existing `nextOpposingSpeech`. Then `addNode({ sheetId, speechId: target, parentId: node.id })` and select+insert (unchanged).
- `status.toggleConceded`/`status.toggleExtended`: no-op when the selected node is on a cx sheet (look up the sheet kind; return early).
- `sheet.next`/`sheet.prev`/`sheet.jumpN`: operate on flow sheets only — change `sortedSheets(round.sheets)` usages in these handlers to exclude `kind === 'cx'`. (This restores the previously-regressed `sheet.next` test.)
- Tests: answer-across on a cx Question creates a child in the paired Response column; toggling conceded on a cx node leaves statuses empty; `sheet.next` skips the CX sheet.

## R4: Sidebar — CX as its own section above Aff
**Files:** `src/components/Sidebar.tsx`; test.
Replace the single pinned CX button (from original Task 17) with a labeled section ABOVE the Aff/Neg sections: a `CX` group header (same styling as the Aff/Neg `font-mono …` labels) followed by the CX sheet row (selectable, active-highlight, NO delete/rename). Keep CX excluded from the Aff/Neg group lists.
Test: a `CX` section label renders above the Aff label; clicking the CX row sets it active.

## R5: Remove bespoke CX model + rework Excel CX export to read nodes
**Files:** `src/lib/model/types.ts`, `src/lib/model/normalize.ts`(+test), `src/lib/store/useRoundStore.ts`(+test), delete `src/components/CxSheet.tsx`/`CxSheet.test.tsx`, `src/lib/export/xlsx.ts`(+test), `src/lib/persistence/io.ts` if it references cx.
- Remove `CxData`/`CxRow`/`CxPeriod` types and `round.cx`. Remove `addCxRow`/`updateCxRow`/`removeCxRow` from store + their tests. Remove `emptyCx` and cx-seeding from `normalize.ts`/`createRound` (keep `makeCxSheet` + scouting). Update normalize tests (drop cx assertions).
- Delete `CxSheet.tsx` + test.
- Rework `patchCx(cxXml, round)` in `xlsx.ts` to read CX **nodes**: for each period, for each Question node (speechId `cx-<p>-q`) in `order`, write its text to the period's Question column and its child (Response) node's text to the Response column, starting at the first data row. Period→column map (verified Task 18): 1AC→A/B, 1NC→C/D, 2AC→E/F, 2NC→G/H; first data row 3. Update the xlsx CX test to set up nodes instead of `round.cx`.
- Run full `npx vitest run` + `npx tsc --noEmit` clean (except pre-existing readonly[] in AppRoot.test/autosave.test).

## Final
Full suite + lint + tsc; manual smoke of CX sheet (type a question, answer-across to response, undo, export).
