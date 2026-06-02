# Export System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single JSON Export button with an export menu offering JSON, Excel (a macro-preserving populated copy of the user's `Flow.xltm` template), and PDF.

**Architecture:** Three exporters under `src/lib/export/`, each a pure-ish function of the live `Round` producing a `Blob`. They share node placement via `buildLayout`, which is extracted from `FlowGrid.tsx` into `src/lib/grid/layout.ts`. Excel is built by editing the template's OOXML zip in place (via `fflate`) so VBA macros survive; PDF is drawn with `pdf-lib`.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Zustand / Vitest (jsdom). New deps: `fflate` (zip), `pdf-lib` (PDF).

---

## File Structure

**Create:**
- `public/templates/Flow.xltm` — the template asset, moved from repo root, served statically.
- `src/lib/grid/layout.ts` — extracted `buildLayout` + `PlacedNode` (pure).
- `src/lib/grid/layout.test.ts`
- `src/lib/export/download.ts` — `downloadBlob`, `exportFilename` helpers.
- `src/lib/export/download.test.ts`
- `src/lib/export/columns.ts` — speech-name → template column mapping (pure).
- `src/lib/export/columns.test.ts`
- `src/lib/export/cells.ts` — `buildExportSheets`: model → placed export cells (pure).
- `src/lib/export/cells.test.ts`
- `src/lib/export/xlsxParts.ts` — pure OOXML string helpers (escape, cells, rows, sheet/workbook patches).
- `src/lib/export/xlsxParts.test.ts`
- `src/lib/export/xlsx.ts` — `buildXlsx(round, templateBytes)` core + `downloadXlsx(round)` browser orchestrator.
- `src/lib/export/xlsx.test.ts`
- `src/lib/export/pdf.ts` — `buildPdf(round)` + `downloadPdf(round)`.
- `src/lib/export/pdf.test.ts`
- `src/components/ExportMenu.tsx` — the dropdown.
- `src/components/ExportMenu.test.tsx`

**Modify:**
- `src/components/FlowGrid.tsx` — import `buildLayout`/`PlacedNode` from `@/lib/grid/layout`; delete the local copies.
- `src/components/RoundHeader.tsx` — swap the Export button for `<ExportMenu>`; remove the standalone Print button.
- `src/components/RoundHeader.test.tsx` — drop the Print-button assertion; assert the export menu renders.
- `package.json` — add `fflate`, `pdf-lib`.

---

## Task 1: Add dependencies and move the template asset

**Files:**
- Modify: `package.json`
- Create: `public/templates/Flow.xltm` (move from `./Flow.xltm`)

- [ ] **Step 1: Install the two libraries**

Run:
```bash
npm install fflate pdf-lib
```
Expected: both added to `dependencies`; `npm ls fflate pdf-lib` prints versions with no errors.

- [ ] **Step 2: Move the template into public/**

Run:
```bash
mkdir -p public/templates
git mv Flow.xltm public/templates/Flow.xltm
```
Expected: `public/templates/Flow.xltm` exists; `git status` shows the rename.

- [ ] **Step 3: Verify the dev server can serve it**

Run:
```bash
ls -l public/templates/Flow.xltm
```
Expected: file present, ~54 KB.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/templates/Flow.xltm
git commit -m "build(export): add fflate + pdf-lib, move Flow.xltm to public/templates"
```

---

## Task 2: Extract `buildLayout` into a shared module

`buildLayout` and `PlacedNode` currently live inside `src/components/FlowGrid.tsx` (lines ~26–108). Move them verbatim into a pure module so the exporters reuse the exact on-screen placement.

**Files:**
- Create: `src/lib/grid/layout.ts`
- Create: `src/lib/grid/layout.test.ts`
- Modify: `src/components/FlowGrid.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/grid/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildLayout } from './layout';
import type { ArgumentNode, Speech } from '@/lib/model/types';

const speeches: Speech[] = [
  { id: 's0', name: '1AC', side: 'aff', seconds: 0 },
  { id: 's1', name: '1NC', side: 'neg', seconds: 0 },
];

function node(p: Partial<ArgumentNode> & { id: string; speechId: string }): ArgumentNode {
  return { sheetId: 'sh', parentId: null, order: 0, text: '', statuses: [], ...p };
}

describe('buildLayout', () => {
  it('places a parent spanning its two children', () => {
    const nodes = [
      node({ id: 'p', speechId: 's0' }),
      node({ id: 'c1', speechId: 's1', parentId: 'p', order: 0 }),
      node({ id: 'c2', speechId: 's1', parentId: 'p', order: 1 }),
    ];
    const { placed, totalRows } = buildLayout(nodes, speeches);
    const parent = placed.find(p => p.node.id === 'p')!;
    expect(parent.col).toBe(0);
    expect(parent.startRow).toBe(0);
    expect(parent.rowSpan).toBe(2);
    expect(totalRows).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/grid/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Create `src/lib/grid/layout.ts`**

Move the layout code out of `FlowGrid.tsx` verbatim. The file is:
```ts
/**
 * Elastic flow layout: turns the argument tree into (row, col, rowSpan) placements.
 * Extracted from FlowGrid so exporters reuse the exact on-screen placement.
 *
 * ASSUMPTION: responses always live in a LATER column than their parent.
 */

import type { ArgumentNode, Speech } from '@/lib/model/types';

export interface PlacedNode {
  node: ArgumentNode;
  startRow: number;
  rowSpan: number;
  col: number;
}

export function buildLayout(
  nodes: ArgumentNode[],
  speeches: Speech[],
): { placed: PlacedNode[]; totalRows: number } {
  if (nodes.length === 0) {
    return { placed: [], totalRows: 0 };
  }

  const colIndex = new Map<string, number>(speeches.map((s, i) => [s.id, i]));
  const validNodes = nodes.filter(n => colIndex.has(n.speechId));

  const childrenByParent = new Map<string | null, ArgumentNode[]>();
  for (const node of validNodes) {
    const key = node.parentId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(node);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.order - b.order);
  }

  const roots = (childrenByParent.get(null) ?? []).slice().sort((a, b) => {
    const ca = colIndex.get(a.speechId) ?? 0;
    const cb = colIndex.get(b.speechId) ?? 0;
    return ca !== cb ? ca - cb : a.order - b.order;
  });

  const leafCountCache = new Map<string, number>();
  function leafCount(node: ArgumentNode, visiting: Set<string> = new Set()): number {
    if (leafCountCache.has(node.id)) return leafCountCache.get(node.id)!;
    if (visiting.has(node.id)) return 1;
    visiting.add(node.id);
    const children = childrenByParent.get(node.id) ?? [];
    const count = children.length === 0 ? 1 : children.reduce((s, c) => s + leafCount(c, visiting), 0);
    visiting.delete(node.id);
    leafCountCache.set(node.id, count);
    return count;
  }

  const placed: PlacedNode[] = [];
  const visited = new Set<string>();

  function place(node: ArgumentNode, startRow: number): void {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    const col = colIndex.get(node.speechId) ?? 0;
    const rowSpan = leafCount(node);
    placed.push({ node, startRow, rowSpan, col });
    const children = childrenByParent.get(node.id) ?? [];
    let cursor = startRow;
    for (const child of children) {
      place(child, cursor);
      cursor += leafCount(child);
    }
  }

  let totalRows = 0;
  for (const root of roots) {
    place(root, totalRows);
    totalRows += leafCount(root);
  }

  return { placed, totalRows };
}
```

- [ ] **Step 4: Update `FlowGrid.tsx` to import from the new module**

In `src/components/FlowGrid.tsx`: delete the local `PlacedNode` interface and the entire `buildLayout` function (the "Types used internally" + "Layout algorithm" blocks, ~lines 24–108). Add to the imports near the top:
```ts
import { buildLayout, type PlacedNode } from '@/lib/grid/layout';
```
Leave the rest of the component (which calls `buildLayout(...)` and uses `PlacedNode`) unchanged.

- [ ] **Step 5: Run the new test and the FlowGrid tests**

Run: `npx vitest run src/lib/grid/layout.test.ts src/components/FlowGrid.test.tsx`
Expected: PASS for both (FlowGrid behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/lib/grid/layout.ts src/lib/grid/layout.test.ts src/components/FlowGrid.tsx
git commit -m "refactor(grid): extract buildLayout into shared src/lib/grid/layout"
```

---

## Task 3: Shared download + filename helpers

**Files:**
- Create: `src/lib/export/download.ts`
- Create: `src/lib/export/download.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/download.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { exportFilename, isoDate } from './download';

describe('exportFilename', () => {
  it('builds a sanitized name with role, date, and extension', () => {
    const ts = Date.UTC(2026, 5, 2); // 2026-06-02
    expect(exportFilename('aff', ts, 'xlsm')).toBe('debate-flow-aff-20260602.xlsm');
  });
});

describe('isoDate', () => {
  it('formats a timestamp as YYYY-MM-DD', () => {
    expect(isoDate(Date.UTC(2026, 5, 2))).toBe('2026-06-02');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/export/download.test.ts`
Expected: FAIL — cannot resolve `./download`.

- [ ] **Step 3: Implement `src/lib/export/download.ts`**

```ts
/** Filename + download helpers shared by the exporters. */

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

/** Compact date for filenames: YYYYMMDD (UTC). */
function compactDate(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
}

/** Human date for spreadsheet cells: YYYY-MM-DD (UTC). */
export function isoDate(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

/** e.g. debate-flow-aff-20260602.xlsm */
export function exportFilename(role: string, ts: number, ext: string): string {
  return `debate-flow-${sanitize(role)}-${compactDate(ts)}.${ext}`;
}

/** Trigger a browser download of a Blob. No-op safe outside the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/export/download.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/download.ts src/lib/export/download.test.ts
git commit -m "feat(export): shared filename + download helpers"
```

---

## Task 4: Speech-name → template column mapping

**Files:**
- Create: `src/lib/export/columns.ts`
- Create: `src/lib/export/columns.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/columns.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { templateColumn, colLetter, AFF_COLUMNS, NEG_COLUMNS } from './columns';

describe('templateColumn', () => {
  it('maps aff speeches to the 7-column aff template', () => {
    expect(templateColumn('aff', '1AC')).toBe(0);
    expect(templateColumn('aff', 'Block')).toBe(3);
    expect(templateColumn('aff', '2AR')).toBe(6);
  });
  it('maps neg speeches to the 6-column neg template (no 1AC)', () => {
    expect(templateColumn('neg', '1NC')).toBe(0);
    expect(templateColumn('neg', '1AC')).toBe(-1);
  });
});

describe('colLetter', () => {
  it('converts 0-based index to a column letter', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(6)).toBe('G');
  });
});

describe('column constants', () => {
  it('match the template header order', () => {
    expect(AFF_COLUMNS).toEqual(['1AC', '1NC', '2AC', 'Block', '1AR', '2NR', '2AR']);
    expect(NEG_COLUMNS).toEqual(['1NC', '2AC', 'Block', '1AR', '2NR', '2AR']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/export/columns.test.ts`
Expected: FAIL — cannot resolve `./columns`.

- [ ] **Step 3: Implement `src/lib/export/columns.ts`**

```ts
/**
 * Maps the app's policy speech names onto the Flow.xltm template columns.
 * The AFF flow sheet has all 7 speech columns; the NEG flow sheet drops 1AC.
 */

export const AFF_COLUMNS = ['1AC', '1NC', '2AC', 'Block', '1AR', '2NR', '2AR'];
export const NEG_COLUMNS = ['1NC', '2AC', 'Block', '1AR', '2NR', '2AR'];

/** 0-based column index → Excel letter (A..G is all we need). */
export function colLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * 0-based template column for a speech name on the given side,
 * or -1 if that speech does not appear on that side's flow sheet.
 */
export function templateColumn(side: 'aff' | 'neg', speechName: string): number {
  const cols = side === 'aff' ? AFF_COLUMNS : NEG_COLUMNS;
  return cols.indexOf(speechName);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/export/columns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/columns.ts src/lib/export/columns.test.ts
git commit -m "feat(export): speech-name to template-column mapping"
```

---

## Task 5: `buildExportSheets` — model to placed export cells

This is the shared bridge both Excel and PDF consume. It runs `buildLayout` per sheet, applies the numbering overlay, and flattens decorations.

**Files:**
- Create: `src/lib/export/cells.ts`
- Create: `src/lib/export/cells.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/cells.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildExportSheets } from './cells';
import type { Round } from '@/lib/model/types';

function round(): Round {
  return {
    id: 'r', createdAt: 0, updatedAt: 0, role: 'aff',
    format: {
      id: 'f', name: 'Policy', prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: 's0', name: '1AC', side: 'aff', seconds: 0 },
        { id: 's1', name: '1NC', side: 'neg', seconds: 0 },
      ],
    },
    meta: {},
    sheets: [{ id: 'sh', title: 'T', group: 'aff', order: 0 }],
    nodes: [
      { id: 'p', sheetId: 'sh', speechId: 's0', parentId: null, order: 0, text: 'Root', statuses: [] },
      { id: 'c', sheetId: 'sh', speechId: 's1', parentId: 'p', order: 0, text: 'Resp', statuses: ['conceded'] },
    ],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  };
}

describe('buildExportSheets', () => {
  it('produces placed cells with numbering prefix and decorations', () => {
    const [es] = buildExportSheets(round());
    expect(es.sheet.title).toBe('T');
    const root = es.cells.find(c => c.col === 0)!;
    expect(root.text).toBe('Root');          // roots are unnumbered
    expect(root.speechName).toBe('1AC');
    const resp = es.cells.find(c => c.col === 1)!;
    expect(resp.text).toBe('1. Resp');        // response numbered within siblings
    expect(resp.crossed).toBe(true);          // conceded -> crossed
    expect(resp.row).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/export/cells.test.ts`
Expected: FAIL — cannot resolve `./cells`.

- [ ] **Step 3: Implement `src/lib/export/cells.ts`**

```ts
/**
 * Bridges the round model to placed export cells used by both the Excel and PDF
 * exporters. One ExportSheet per flow sheet; cells carry the same row/col the
 * on-screen grid uses, plus the numbering overlay and flattened decorations.
 */

import type { Round, Sheet } from '@/lib/model/types';
import { buildLayout } from '@/lib/grid/layout';
import { numberFor } from '@/lib/model/numbering';

export interface ExportCell {
  /** 0-based column index within format.speeches (matches the grid). */
  col: number;
  /** Speech name (used by Excel to resolve the template column). */
  speechName: string;
  /** 0-based body row (header excluded). */
  row: number;
  /** Display text, numbering prefix applied. */
  text: string;
  /** conceded → strikethrough. */
  crossed: boolean;
  /** extended → arrow marker. */
  extended: boolean;
}

export interface ExportSheet {
  sheet: Sheet;
  cells: ExportCell[];
  /** Number of body rows the flow occupies. */
  rowCount: number;
}

export function buildExportSheets(round: Round): ExportSheet[] {
  const speeches = round.format.speeches;
  return round.sheets
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(sheet => {
      const sheetNodes = round.nodes.filter(n => n.sheetId === sheet.id);
      const { placed, totalRows } = buildLayout(sheetNodes, speeches);
      const cells: ExportCell[] = placed.map(p => {
        const num = numberFor(sheetNodes, p.node.id);
        const prefix = num !== null ? `${num}. ` : '';
        return {
          col: p.col,
          speechName: speeches[p.col]?.name ?? '',
          row: p.startRow,
          text: prefix + p.node.text,
          crossed: p.node.statuses.includes('conceded'),
          extended: p.node.statuses.includes('extended'),
        };
      });
      return { sheet, cells, rowCount: totalRows };
    });
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/export/cells.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/cells.ts src/lib/export/cells.test.ts
git commit -m "feat(export): buildExportSheets bridge (layout + numbering + decorations)"
```

---

## Task 6: Pure OOXML string helpers

All the string surgery lives here as small, individually tested functions. No zip, no I/O — just `string → string`.

**Files:**
- Create: `src/lib/export/xlsxParts.ts`
- Create: `src/lib/export/xlsxParts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/xlsxParts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  escXml, inlineCell, buildBodyRow, setCellInline,
  buildFlowSheetXml, registerSheets, toWorkbookContentType,
} from './xlsxParts';
import type { ExportSheet } from './cells';

describe('escXml', () => {
  it('escapes XML metacharacters', () => {
    expect(escXml('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; &quot;d&quot;');
  });
});

describe('inlineCell', () => {
  it('emits an inline-string cell', () => {
    expect(inlineCell('A3', { text: 'hi', crossed: false, extended: false }))
      .toContain('<c r="A3" t="inlineStr">');
  });
  it('wraps crossed text in a strike run and prefixes extended with an arrow', () => {
    const xml = inlineCell('B3', { text: 'x', crossed: true, extended: true });
    expect(xml).toContain('<strike/>');
    expect(xml).toContain('→ x');
  });
});

describe('buildBodyRow', () => {
  it('omits empty columns and emits only filled cells', () => {
    const byCol = new Map([[2, { text: 'y', crossed: false, extended: false }]]);
    const row = buildBodyRow(5, byCol);
    expect(row).toContain('<row r="5">');
    expect(row).toContain('r="C5"');
    expect(row).not.toContain('r="A5"');
  });
});

describe('setCellInline', () => {
  it('replaces a self-closing cell with an inline-string cell, keeping its style', () => {
    const out = setCellInline('<c r="D11" s="83"/>', 'D11', 'Tourney');
    expect(out).toBe('<c r="D11" s="83" t="inlineStr"><is><t xml:space="preserve">Tourney</t></is></c>');
  });
});

describe('toWorkbookContentType', () => {
  it('flips the macro template main type to the macro workbook type', () => {
    const ct = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.template.macroEnabled.main+xml"/>';
    expect(toWorkbookContentType(ct)).toContain('application/vnd.ms-excel.sheet.macroEnabled.main+xml');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/export/xlsxParts.test.ts`
Expected: FAIL — cannot resolve `./xlsxParts`.

- [ ] **Step 3: Implement `src/lib/export/xlsxParts.ts`**

```ts
/**
 * Pure OOXML string surgery for the Excel exporter. Each function is string→string
 * so it is unit-testable without a zip. Values are written as inline strings
 * (t="inlineStr") so we never touch sharedStrings.xml or styles.xml — cells keep
 * their template column style, and bold/strike ride on inline runs.
 */

import type { ExportSheet } from './cells';
import { templateColumn, colLetter } from './columns';

export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface CellText { text: string; crossed: boolean; extended: boolean }

/** An inline-string cell. Strike rides on the run's rPr; extended prefixes an arrow. */
export function inlineCell(ref: string, cell: CellText): string {
  const text = escXml((cell.extended ? '→ ' : '') + cell.text);
  const rPr = cell.crossed ? '<rPr><strike/></rPr>' : '';
  return `<c r="${ref}" t="inlineStr"><is><r>${rPr}<t xml:space="preserve">${text}</t></r></is></c>`;
}

/** A body <row> with only the filled columns (sparse). Returns '' if no cells. */
export function buildBodyRow(rowNum: number, byCol: Map<number, CellText>): string {
  let cells = '';
  const sorted = [...byCol.keys()].sort((a, b) => a - b);
  for (const col of sorted) {
    cells += inlineCell(colLetter(col) + rowNum, byCol.get(col)!);
  }
  return cells ? `<row r="${rowNum}">${cells}</row>` : '';
}

/** Replace a self-closing `<c r="REF" .../>` with an inline-string cell, keeping attrs. */
export function setCellInline(xml: string, ref: string, value: string): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)/>`);
  return xml.replace(
    re,
    `<c r="${ref}"$1 t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`,
  );
}

/**
 * Build a populated flow worksheet from a template (AFF or NEG) worksheet XML.
 * Keeps template rows 1 (title) and 2 (speech headers); replaces the body with
 * generated rows; strips the duplicate codeName; updates the dimension.
 */
export function buildFlowSheetXml(templateXml: string, es: ExportSheet): string {
  const side = es.sheet.group;

  // Group cells by Excel row → (template column → cell).
  const byRow = new Map<number, Map<number, CellText>>();
  let maxRow = 2;
  for (const cell of es.cells) {
    const tcol = templateColumn(side, cell.speechName);
    if (tcol < 0) continue;
    const excelRow = cell.row + 3; // rows 1–2 are title + headers
    if (!byRow.has(excelRow)) byRow.set(excelRow, new Map());
    byRow.get(excelRow)!.set(tcol, { text: cell.text, crossed: cell.crossed, extended: cell.extended });
    if (excelRow > maxRow) maxRow = excelRow;
  }

  // Pull template rows 1 and 2 out of the original sheetData.
  const sheetData = templateXml.match(/<sheetData>[\s\S]*?<\/sheetData>/)?.[0] ?? '<sheetData></sheetData>';
  const row1 = sheetData.match(/<row r="1"[\s\S]*?<\/row>/)?.[0] ?? '';
  const row2 = sheetData.match(/<row r="2"[\s\S]*?<\/row>/)?.[0] ?? '';
  const titledRow1 = setCellInline(row1, 'A1', es.sheet.title);

  // Generate body rows in order.
  let body = '';
  for (const rowNum of [...byRow.keys()].sort((a, b) => a - b)) {
    body += buildBodyRow(rowNum, byRow.get(rowNum)!);
  }

  const lastCol = side === 'aff' ? 'G' : 'F';
  return templateXml
    .replace(/ codeName="[^"]*"/, '')
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastCol}${maxRow}"/>`)
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${titledRow1}${row2}${body}</sheetData>`);
}

export interface NewSheet { name: string; sheetId: number; rid: string; partName: string }

/** Insert the new <sheet> entries into workbook.xml just before </sheets>. */
export function registerSheetsInWorkbook(workbookXml: string, sheets: NewSheet[]): string {
  const entries = sheets
    .map(s => `<sheet name="${escXml(s.name)}" sheetId="${s.sheetId}" r:id="${s.rid}"/>`)
    .join('');
  return workbookXml.replace('</sheets>', `${entries}</sheets>`);
}

/** Add worksheet relationships before </Relationships>. */
export function registerSheetsInRels(relsXml: string, sheets: NewSheet[]): string {
  const entries = sheets
    .map(s => `<Relationship Id="${s.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${s.partName}"/>`)
    .join('');
  return relsXml.replace('</Relationships>', `${entries}</Relationships>`);
}

/** Add worksheet content-type overrides; drop calcChain; flip workbook main type. */
export function registerSheetsInContentTypes(ctXml: string, sheets: NewSheet[]): string {
  const entries = sheets
    .map(s => `<Override PartName="/xl/worksheets/${s.partName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  let out = ctXml.replace('</Types>', `${entries}</Types>`);
  out = out.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
  return toWorkbookContentType(out);
}

/** Flip the macro-template main content type to the macro-workbook main type. */
export function toWorkbookContentType(ctXml: string): string {
  return ctXml.replace(
    'application/vnd.ms-excel.template.macroEnabled.main+xml',
    'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
  );
}

/** Convenience: combined helper used by the test re-export. */
export const registerSheets = {
  workbook: registerSheetsInWorkbook,
  rels: registerSheetsInRels,
  contentTypes: registerSheetsInContentTypes,
};
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/export/xlsxParts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/xlsxParts.ts src/lib/export/xlsxParts.test.ts
git commit -m "feat(export): pure OOXML string helpers for Excel surgery"
```

---

## Task 7: `buildXlsx` — assemble the populated workbook

Ties the part-helpers together: unzip the template, patch Info, add a populated sheet per flow sheet, register them, drop calcChain, re-zip.

**Files:**
- Create: `src/lib/export/xlsx.ts`
- Create: `src/lib/export/xlsx.test.ts`

- [ ] **Step 1: Write the failing test (against the real template)**

Create `src/lib/export/xlsx.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { buildXlsx } from './xlsx';
import type { Round } from '@/lib/model/types';

const template = new Uint8Array(
  readFileSync(resolve(process.cwd(), 'public/templates/Flow.xltm')),
);

function round(): Round {
  return {
    id: 'r', createdAt: Date.UTC(2026, 5, 2), updatedAt: 0, role: 'aff',
    format: {
      id: 'f', name: 'Policy', prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: 's0', name: '1AC', side: 'aff', seconds: 0 },
        { id: 's1', name: '1NC', side: 'neg', seconds: 0 },
      ],
    },
    meta: { tournament: 'States', roundLabel: 'R3' },
    sheets: [{ id: 'sh', title: 'Politics DA', group: 'aff', order: 0 }],
    nodes: [
      { id: 'p', sheetId: 'sh', speechId: 's0', parentId: null, order: 0, text: 'Uniqueness', statuses: [] },
    ],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  };
}

describe('buildXlsx', () => {
  it('produces a valid zip with a populated sheet and patched Info', () => {
    const bytes = buildXlsx(round(), template);
    const files = unzipSync(bytes);

    // VBA preserved.
    expect(files['xl/vbaProject.bin']).toBeDefined();
    // calcChain dropped.
    expect(files['xl/calcChain.xml']).toBeUndefined();
    // Content type flipped to macro workbook.
    expect(strFromU8(files['[Content_Types].xml'])).toContain('sheet.macroEnabled.main+xml');
    // New worksheet exists and contains the node text + sheet title.
    const newSheet = strFromU8(files['xl/worksheets/sheet6.xml']);
    expect(newSheet).toContain('Uniqueness');
    expect(newSheet).toContain('Politics DA');
    // Workbook registers the new tab name.
    expect(strFromU8(files['xl/workbook.xml'])).toContain('Politics DA');
    // Info sheet got the tournament value.
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('States');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/export/xlsx.test.ts`
Expected: FAIL — cannot resolve `./xlsx`.

- [ ] **Step 3: Implement `src/lib/export/xlsx.ts`**

```ts
/**
 * Excel exporter. Edits the Flow.xltm OOXML zip in place so the VBA macros and
 * exact styling survive, then re-zips as a macro-enabled .xlsm. The hidden AFF/NEG
 * template sheets are kept intact; one populated visible sheet is added per flow sheet.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { Round } from '@/lib/model/types';
import { buildExportSheets } from './cells';
import {
  buildFlowSheetXml,
  registerSheetsInWorkbook,
  registerSheetsInRels,
  registerSheetsInContentTypes,
  setCellInline,
  type NewSheet,
} from './xlsxParts';
import { isoDate, exportFilename, downloadBlob } from './download';

const AFF_TEMPLATE_PART = 'xl/worksheets/sheet2.xml';
const NEG_TEMPLATE_PART = 'xl/worksheets/sheet3.xml';
const INFO_PART = 'xl/worksheets/sheet1.xml';

/** Existing sheetIds in the template; new sheets start above the max. */
const EXISTING_SHEET_IDS = [1, 3, 21, 48, 35];
/** Existing relationship ids go up to rId11. */
const FIRST_NEW_RID = 12;
/** Existing worksheet parts are sheet1..sheet5; new parts start at sheet6. */
const FIRST_NEW_PART = 6;

function patchInfo(infoXml: string, round: Round): string {
  let xml = infoXml;
  const m = round.meta;
  if (m.tournament) xml = setCellInline(xml, 'D11', m.tournament);
  if (m.roundLabel) xml = setCellInline(xml, 'D12', m.roundLabel);
  xml = setCellInline(xml, 'D13', isoDate(round.createdAt));
  if (m.affName) xml = setCellInline(xml, 'D8', m.affName);
  if (m.negName) xml = setCellInline(xml, 'H8', m.negName);
  if (m.judge) xml = setCellInline(xml, 'D16', m.judge);
  return xml;
}

/** Build the populated .xlsm bytes. Pure given the template bytes. */
export function buildXlsx(round: Round, templateBytes: Uint8Array): Uint8Array {
  const files = unzipSync(templateBytes);

  const affTemplate = strFromU8(files[AFF_TEMPLATE_PART]);
  const negTemplate = strFromU8(files[NEG_TEMPLATE_PART]);

  // Patch Info.
  files[INFO_PART] = strToU8(patchInfo(strFromU8(files[INFO_PART]), round));

  // Build one new sheet per flow sheet.
  const exportSheets = buildExportSheets(round);
  const maxExistingId = Math.max(...EXISTING_SHEET_IDS);
  const newSheets: NewSheet[] = [];

  exportSheets.forEach((es, i) => {
    const partName = `sheet${FIRST_NEW_PART + i}.xml`;
    const meta: NewSheet = {
      name: es.sheet.title || `Sheet ${i + 1}`,
      sheetId: maxExistingId + 1 + i,
      rid: `rId${FIRST_NEW_RID + i}`,
      partName,
    };
    const template = es.sheet.group === 'aff' ? affTemplate : negTemplate;
    files[`xl/worksheets/${partName}`] = strToU8(buildFlowSheetXml(template, es));
    newSheets.push(meta);
  });

  // Register everywhere.
  files['xl/workbook.xml'] = strToU8(registerSheetsInWorkbook(strFromU8(files['xl/workbook.xml']), newSheets));
  files['xl/_rels/workbook.xml.rels'] = strToU8(registerSheetsInRels(strFromU8(files['xl/_rels/workbook.xml.rels']), newSheets));
  files['[Content_Types].xml'] = strToU8(registerSheetsInContentTypes(strFromU8(files['[Content_Types].xml']), newSheets));

  // Drop calcChain so Excel rebuilds it (sheet set changed).
  delete files['xl/calcChain.xml'];

  return zipSync(files);
}

/** Browser orchestrator: fetch template, build, download. */
export async function downloadXlsx(round: Round): Promise<void> {
  const res = await fetch('/templates/Flow.xltm');
  if (!res.ok) throw new Error('Could not load the Excel template');
  const templateBytes = new Uint8Array(await res.arrayBuffer());
  const bytes = buildXlsx(round, templateBytes);
  const blob = new Blob([bytes], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, 'xlsm'));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/export/xlsx.test.ts`
Expected: PASS. If `xl/worksheets/sheet6.xml` is missing, confirm `FIRST_NEW_PART` matches the template's sheet count (5).

- [ ] **Step 5: Manual smoke check (open in Excel)**

Run the dev server (`npm run dev`), export an aff round to Excel, and open the `.xlsm` in Excel. Confirm: it opens without repair, macros are present (enable content), the new tab shows the flow, and the Info sheet shows the tournament/round/date.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/xlsx.ts src/lib/export/xlsx.test.ts
git commit -m "feat(export): Excel exporter (macro-preserving Flow.xltm population)"
```

---

## Task 8: PDF exporter

**Files:**
- Create: `src/lib/export/pdf.ts`
- Create: `src/lib/export/pdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/pdf.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPdf } from './pdf';
import type { Round } from '@/lib/model/types';

function round(sheets: number): Round {
  return {
    id: 'r', createdAt: 0, updatedAt: 0, role: 'aff',
    format: {
      id: 'f', name: 'Policy', prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: 's0', name: '1AC', side: 'aff', seconds: 0 },
        { id: 's1', name: '1NC', side: 'neg', seconds: 0 },
      ],
    },
    meta: {},
    sheets: Array.from({ length: sheets }, (_, i) => ({ id: `sh${i}`, title: `S${i}`, group: 'aff' as const, order: i })),
    nodes: [{ id: 'p', sheetId: 'sh0', speechId: 's0', parentId: null, order: 0, text: 'Hello', statuses: [] }],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  };
}

describe('buildPdf', () => {
  it('produces a valid PDF with one page per sheet', async () => {
    const bytes = await buildPdf(round(2));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/export/pdf.test.ts`
Expected: FAIL — cannot resolve `./pdf`.

- [ ] **Step 3: Implement `src/lib/export/pdf.ts`**

```ts
/**
 * PDF exporter. Draws each flow sheet as a grid on its own landscape page using
 * the same placement as the on-screen grid. Aff columns blue, neg columns red.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Round } from '@/lib/model/types';
import { buildExportSheets } from './cells';
import { exportFilename, downloadBlob } from './download';

const PAGE_W = 792; // US-letter landscape
const PAGE_H = 612;
const MARGIN = 24;
const HEADER_H = 20;
const ROW_H = 16;
const FONT_SIZE = 7;

const AFF = rgb(0.09, 0.55, 0.82); // blue
const NEG = rgb(0.78, 0.16, 0.16); // red
const INK = rgb(0.1, 0.1, 0.1);

/** Naive width-based wrap into lines that fit `maxWidth`. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawSheet(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  speeches: Round['format']['speeches'],
  cells: ReturnType<typeof buildExportSheets>[number]['cells'],
): void {
  const cols = speeches.length;
  const colW = (PAGE_W - 2 * MARGIN) / cols;
  const topY = PAGE_H - MARGIN;

  // Header row of speech names.
  speeches.forEach((s, c) => {
    page.drawText(s.name, {
      x: MARGIN + c * colW + 2,
      y: topY - FONT_SIZE - 2,
      size: FONT_SIZE + 1,
      font: boldFont,
      color: s.side === 'aff' ? AFF : NEG,
    });
  });

  // Cells.
  for (const cell of cells) {
    const x = MARGIN + cell.col * colW + 2;
    const yTop = topY - HEADER_H - cell.row * ROW_H;
    const prefix = cell.extended ? '→ ' : '';
    const lines = wrap(prefix + cell.text, font, FONT_SIZE, colW - 4);
    lines.forEach((ln, li) => {
      const y = yTop - FONT_SIZE - li * (FONT_SIZE + 1);
      page.drawText(ln, { x, y, size: FONT_SIZE, font, color: INK });
      if (cell.crossed) {
        const w = font.widthOfTextAtSize(ln, FONT_SIZE);
        page.drawLine({
          start: { x, y: y + FONT_SIZE * 0.3 },
          end: { x: x + w, y: y + FONT_SIZE * 0.3 },
          thickness: 0.5,
          color: INK,
        });
      }
    });
  }
}

export async function buildPdf(round: Round): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const speeches = round.format.speeches;

  for (const es of buildExportSheets(round)) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawText(es.sheet.title, { x: MARGIN, y: PAGE_H - MARGIN + 4, size: 10, font: boldFont, color: INK });
    drawSheet(page, font, boldFont, speeches, es.cells);
  }

  // Always at least one page.
  if (round.sheets.length === 0) doc.addPage([PAGE_W, PAGE_H]);

  return doc.save();
}

export async function downloadPdf(round: Round): Promise<void> {
  const bytes = await buildPdf(round);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, 'pdf'));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/export/pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/pdf.ts src/lib/export/pdf.test.ts
git commit -m "feat(export): PDF exporter via pdf-lib"
```

---

## Task 9: `ExportMenu` component

A dropdown with JSON / Excel / PDF. JSON reuses the existing `downloadRoundFile`; Excel/PDF call the new orchestrators with error handling.

**Files:**
- Create: `src/components/ExportMenu.tsx`
- Create: `src/components/ExportMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ExportMenu.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportMenu from './ExportMenu';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';

vi.mock('@/lib/persistence/io', () => ({ downloadRoundFile: vi.fn() }));
vi.mock('@/lib/export/xlsx', () => ({ downloadXlsx: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/export/pdf', () => ({ downloadPdf: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  useRoundStore.getState().createRound({ role: 'aff', format: makeFormatByKey('policy'), meta: {} });
});

describe('ExportMenu', () => {
  it('opens on click and exposes the three formats', () => {
    render(<ExportMenu />);
    fireEvent.click(screen.getByTestId('export-btn'));
    expect(screen.getByTestId('export-json')).toBeInTheDocument();
    expect(screen.getByTestId('export-excel')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
  });

  it('JSON item invokes downloadRoundFile', async () => {
    const { downloadRoundFile } = await import('@/lib/persistence/io');
    render(<ExportMenu />);
    fireEvent.click(screen.getByTestId('export-btn'));
    fireEvent.click(screen.getByTestId('export-json'));
    expect(downloadRoundFile).toHaveBeenCalled();
  });

  it('Excel item invokes downloadXlsx', async () => {
    const { downloadXlsx } = await import('@/lib/export/xlsx');
    render(<ExportMenu />);
    fireEvent.click(screen.getByTestId('export-btn'));
    fireEvent.click(screen.getByTestId('export-excel'));
    expect(downloadXlsx).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/ExportMenu.test.tsx`
Expected: FAIL — cannot resolve `./ExportMenu`.

- [ ] **Step 3: Implement `src/components/ExportMenu.tsx`**

```tsx
'use client';

/**
 * ExportMenu — the Export button + dropdown offering JSON / Excel / PDF.
 * Closes on select, Escape, or outside click. Errors surface as a non-blocking alert.
 */

import { useEffect, useRef, useState } from 'react';
import type { Round } from '@/lib/model/types';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { downloadRoundFile } from '@/lib/persistence/io';
import { downloadXlsx } from '@/lib/export/xlsx';
import { downloadPdf } from '@/lib/export/pdf';

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(fn: (round: Round) => unknown | Promise<unknown>) {
    const round = useRoundStore.getState().round;
    if (!round) return;
    setOpen(false);
    try {
      await fn(round);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return (
    <div ref={rootRef} style={styles.root} className="no-print">
      <button
        style={styles.actionBtn}
        onClick={() => setOpen(o => !o)}
        data-testid="export-btn"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export ▾
      </button>
      {open && (
        <div role="menu" style={styles.menu}>
          <button role="menuitem" style={styles.item} data-testid="export-json" onClick={() => run(r => downloadRoundFile(r))}>
            JSON
          </button>
          <button role="menuitem" style={styles.item} data-testid="export-excel" onClick={() => run(r => downloadXlsx(r))}>
            Excel
          </button>
          <button role="menuitem" style={styles.item} data-testid="export-pdf" onClick={() => run(r => downloadPdf(r))}>
            PDF
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { position: 'relative', display: 'inline-block' } as React.CSSProperties,
  actionBtn: {
    fontSize: '12px', fontWeight: 500, color: 'var(--muted)', background: 'transparent',
    border: '1px solid var(--line)', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer',
  } as React.CSSProperties,
  menu: {
    position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: '120px',
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '4px', zIndex: 20, display: 'flex', flexDirection: 'column',
  } as React.CSSProperties,
  item: {
    fontSize: '12px', textAlign: 'left', color: 'var(--ink)', background: 'transparent',
    border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer',
  } as React.CSSProperties,
} as const;
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/ExportMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportMenu.tsx src/components/ExportMenu.test.tsx
git commit -m "feat(export): ExportMenu dropdown (JSON/Excel/PDF)"
```

---

## Task 10: Wire `ExportMenu` into the header; remove the Print button

**Files:**
- Modify: `src/components/RoundHeader.tsx`
- Modify: `src/components/RoundHeader.test.tsx`

- [ ] **Step 1: Update the header test first**

In `src/components/RoundHeader.test.tsx`:
- Remove the test/assertions for `print-btn` and the old `export-btn` click → `downloadRoundFile` behavior (that behavior now lives in `ExportMenu.test.tsx`).
- Keep the Import button tests. Add an assertion that the export menu button renders:
```tsx
it('renders the export menu, Import, and New round buttons', () => {
  render(<RoundHeader />);
  expect(screen.getByTestId('export-btn')).toBeInTheDocument();
  expect(screen.getByTestId('import-btn')).toBeInTheDocument();
  expect(screen.getByTestId('new-round-btn')).toBeInTheDocument();
  expect(screen.queryByTestId('print-btn')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/RoundHeader.test.tsx`
Expected: FAIL — `print-btn` still present / export menu not wired.

- [ ] **Step 3: Edit `RoundHeader.tsx`**

- Add import: `import ExportMenu from './ExportMenu';`
- Remove `downloadRoundFile` from the `io` import (keep `readRoundFile`): `import { readRoundFile } from '@/lib/persistence/io';`
- Delete `handleExport` and `handlePrint`.
- In the controls JSX, replace the `export-btn` `<button>` with `<ExportMenu />`, and delete the `print-btn` `<button>`. The result:
```tsx
<div className="no-print" style={styles.controls}>
  <input
    ref={fileInputRef}
    type="file"
    accept=".json"
    aria-label="Import round file"
    style={{ display: 'none' }}
    onChange={handleImportChange}
    data-testid="import-file-input"
  />
  <ExportMenu />
  <button style={styles.actionBtn} onClick={handleImportClick} data-testid="import-btn">
    Import
  </button>
  <button style={styles.newRoundBtn} onClick={handleNewRound} data-testid="new-round-btn">
    New round
  </button>
</div>
```

- [ ] **Step 4: Run the header tests**

Run: `npx vitest run src/components/RoundHeader.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + lint + typecheck**

Run:
```bash
npx vitest run && npm run lint && npx tsc --noEmit
```
Expected: all green (modulo the pre-existing failures noted below).

- [ ] **Step 6: Commit**

```bash
git add src/components/RoundHeader.tsx src/components/RoundHeader.test.tsx
git commit -m "feat(export): wire ExportMenu into header; remove standalone Print button"
```

---

## Notes for the implementer

- **Pre-existing failures (not from this work — do not try to fix here):** 4 stale keymap tests in `effective.test.ts`/`resolve.test.ts`, and 6 `tsc` errors in `AppRoot.test.tsx`/`autosave.test.ts` (readonly array). Treat the suite as green if only these remain. If unsure, run `git stash` and compare the baseline.
- **Why inline strings:** writing values as `t="inlineStr"` avoids editing `sharedStrings.xml` (no index reconciliation) and `styles.xml` (no new cellXfs). Cells keep their template column style; bold/strike ride on the run's `rPr`.
- **`bold` decoration:** the live old model (`ArgumentNode.statuses`) has only `conceded`/`extended`, so only strikethrough + the arrow marker are emitted today. When the editor-model `bold` field lands, add a `bold` flag to `ExportCell` and a `<b/>` run in `inlineCell` / a bold-font branch in the PDF drawer — the decoration plumbing is already in place.
- **Regex robustness:** the OOXML helpers target this specific template's structure (verified). If `buildXlsx` ever produces a file Excel offers to "repair," first check that `sheet6.xml` onward are well-formed and that `registerSheetsInContentTypes` didn't leave a dangling calcChain override.

---

## Self-Review

- **Spec coverage:** export menu (Task 9–10); JSON reuse (Task 9); Excel macro-preserving populate of Info + per-sheet flow with decorations + numbering (Tasks 4–7); PDF generation (Task 8); shared `buildLayout` extraction (Task 2); asset move + deps (Task 1); error handling via alert (Task 9); tests at every layer. All spec sections map to a task.
- **Decisions honored:** preserve macros (.xlsm via zip surgery); keep hidden AFF/NEG + add visible populated sheets; full laid-out flow via shared layout; real generated PDF; best-effort Info metadata; policy-only name mapping; menu keeps Import, drops Print.
- **Type consistency:** `ExportCell`/`ExportSheet` defined in Task 5 and consumed unchanged in Tasks 6–8; `NewSheet` defined in Task 6, used in Task 7; `buildXlsx(round, templateBytes)` / `downloadXlsx(round)` / `buildPdf(round)` / `downloadPdf(round)` signatures consistent across tasks and the menu.
- **No placeholders:** every code step shows complete code; every test shows real assertions and exact run commands.
```
