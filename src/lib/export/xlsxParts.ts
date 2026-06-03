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

/**
 * Parse <col> elements into a 0-indexed column → style-index map.
 * Capped at column 25 (Z) so the catch-all range (min=8 max=16384) does not
 * allocate thousands of entries.
 */
export function parseColStyles(sheetXml: string): Map<number, number> {
  const map = new Map<number, number>();
  const re = /<col\s[^>]*>/g;
  let m;
  while ((m = re.exec(sheetXml)) !== null) {
    const el = m[0];
    const min = parseInt(el.match(/\bmin="(\d+)"/)?.[1] ?? '1');
    const max = Math.min(parseInt(el.match(/\bmax="(\d+)"/)?.[1] ?? '1'), 26);
    const style = parseInt(el.match(/\bstyle="(\d+)"/)?.[1] ?? '0');
    if (!isNaN(style)) {
      for (let c = min; c <= max; c++) {
        map.set(c - 1, style); // convert to 0-indexed
      }
    }
  }
  return map;
}

/** An inline-string cell. Strike rides on the run's rPr; extended prefixes an arrow.
 *  style is the column's xf style index from styles.xml — preserves template background/borders.
 */
export function inlineCell(ref: string, cell: CellText, style?: number): string {
  const text = escXml((cell.extended ? '→ ' : '') + cell.text);
  const rPr = cell.crossed ? '<rPr><strike/></rPr>' : '';
  const sAttr = style !== undefined ? ` s="${style}"` : '';
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><r>${rPr}<t xml:space="preserve">${text}</t></r></is></c>`;
}

/** A body <row> with only the filled columns (sparse). Returns '' if no cells. */
export function buildBodyRow(
  rowNum: number,
  byCol: Map<number, CellText>,
  colStyles?: Map<number, number>,
): string {
  let cells = '';
  const sorted = [...byCol.keys()].sort((a, b) => a - b);
  for (const col of sorted) {
    cells += inlineCell(colLetter(col) + rowNum, byCol.get(col)!, colStyles?.get(col));
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
 * generated rows; strips codeName and the duplicate xr:uid; updates the dimension.
 * Body cells carry the column style index so they inherit the template's alternating
 * background/border formatting from styles.xml.
 */
export function buildFlowSheetXml(templateXml: string, es: ExportSheet): string {
  const side = es.sheet.group;
  const colStyles = parseColStyles(templateXml);

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

  // Generate body rows in order, with column style applied to each cell.
  let body = '';
  for (const rowNum of [...byRow.keys()].sort((a, b) => a - b)) {
    body += buildBodyRow(rowNum, byRow.get(rowNum)!, colStyles);
  }

  const lastCol = side === 'aff' ? 'G' : 'F';
  return templateXml
    .replace(/ codeName="[^"]*"/, '')
    .replace(/ xr:uid="[^"]*"/, '')   // strip duplicate UID — Excel flags two sheets sharing a revision UID as corrupt
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

/** Remove the calcChain relationship so it matches the deleted calcChain.xml part. */
export function removeCalcChainFromRels(relsXml: string): string {
  return relsXml.replace(/<Relationship[^>]*calcChain[^>]*\/>/, '');
}

/** Add worksheet content-type overrides and drop the calcChain override. */
export function registerSheetsInContentTypes(ctXml: string, sheets: NewSheet[]): string {
  const entries = sheets
    .map(s => `<Override PartName="/xl/worksheets/${s.partName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  let out = ctXml.replace('</Types>', `${entries}</Types>`);
  out = out.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
  return out;
}

/** Convenience: combined helper used by the test re-export. */
export const registerSheets = {
  workbook: registerSheetsInWorkbook,
  rels: registerSheetsInRels,
  contentTypes: registerSheetsInContentTypes,
};

