/**
 * PDF exporter. Page 1 is a round-info cover; then each flow sheet flows across
 * as many landscape pages as it needs (no truncation), with measured row heights.
 * Aff columns blue, neg red. CX sheets use a dedicated Question/Response layout.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Round, Speech } from "@/lib/model/types";
import { buildExportSheets, type ExportSheet, type ExportCell } from "./cells";
import type { ExportOptions } from "./options";
import { cxPeriods } from "./cx";
import { teamCode } from "@/lib/model/teamCode";
import { exportFilename, downloadBlob, isoDate } from "./download";

const PAGE_W = 792, PAGE_H = 612, MARGIN = 28;
const HEADER_H = 18, FONT_SIZE = 7, LINE_H = FONT_SIZE + 1.5, CELL_PAD = 3, MIN_ROW_H = 14;
const AFF = rgb(0.09, 0.55, 0.82);
const NEG = rgb(0.78, 0.16, 0.16);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.5, 0.5, 0.5);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function prefixed(c: ExportCell): string {
  return (c.extended ? "-> " : "") + c.text + (c.dropped ? "  [dropped]" : "");
}

/** Per-leaf-row heights so every cell (incl. multi-row spans) fits its wrapped text. */
function measureRowHeights(cells: ExportCell[], totalRows: number, colW: number, font: PDFFont): number[] {
  const h = new Array(totalRows).fill(MIN_ROW_H);
  for (const c of cells) {
    if (c.rowSpan !== 1) continue;
    const need = wrap(prefixed(c), font, FONT_SIZE, colW - 2 * CELL_PAD).length * LINE_H + CELL_PAD;
    h[c.row] = Math.max(h[c.row], need);
  }
  for (const c of cells) {
    if (c.rowSpan <= 1) continue;
    const need = wrap(prefixed(c), font, FONT_SIZE, colW - 2 * CELL_PAD).length * LINE_H + CELL_PAD;
    let have = 0;
    for (let r = c.row; r < c.row + c.rowSpan; r++) have += h[r];
    if (need > have) h[c.row + c.rowSpan - 1] += need - have;
  }
  return h;
}

function drawCover(page: PDFPage, font: PDFFont, bold: PDFFont, round: Round): void {
  const sc = round.scouting;
  let y = PAGE_H - MARGIN - 10;
  const line = (label: string, value: string, f = font, size = 11) => {
    if (!value || !value.trim()) return;
    page.drawText(label ? `${label}: ${value}` : value, { x: MARGIN, y, size, font: f, color: INK });
    y -= size + 8;
  };
  line("", "Debate Flow", bold, 20);
  y -= 6;
  line("", round.format.name + (round.role ? ` - ${round.role.toUpperCase()}` : ""), font, 12);
  y -= 10;
  line("Tournament", sc.tournament ?? "");
  line("Round", sc.round ?? "");
  line("Date", sc.date || isoDate(round.createdAt));
  line("Judge", sc.judge ?? "");
  y -= 6;
  const affCode = teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second);
  const negCode = teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second);
  const name = (d: { first: string; last: string }) => `${d.first} ${d.last}`.trim();
  if (affCode) line("Aff", `${affCode}${sc.affSchool ? ` (${sc.affSchool})` : ""}`);
  if (name(sc.aff.first) || name(sc.aff.second)) line("  Debaters", `${name(sc.aff.first)}, ${name(sc.aff.second)}`, font, 10);
  if (negCode) line("Neg", `${negCode}${sc.negSchool ? ` (${sc.negSchool})` : ""}`);
  if (name(sc.neg.first) || name(sc.neg.second)) line("  Debaters", `${name(sc.neg.first)}, ${name(sc.neg.second)}`, font, 10);
  if (sc.decision?.vote) {
    y -= 6;
    line("Decision", sc.decision.vote.toUpperCase(), bold);
    if (sc.decision.rfd) {
      const lines = wrap(sc.decision.rfd, font, 10, PAGE_W - 2 * MARGIN);
      for (const ln of lines) { page.drawText(ln, { x: MARGIN, y, size: 10, font, color: INK }); y -= 13; }
    }
  }
}

function drawColumnHeaders(page: PDFPage, bold: PDFFont, columns: Speech[], colW: number): void {
  let c = 0;
  while (c < columns.length) {
    const g = columns[c].group;
    let span = 1;
    if (g) while (c + span < columns.length && columns[c + span].group === g) span++;
    const label = g ?? columns[c].name;
    page.drawText(label, {
      x: MARGIN + c * colW + 2,
      y: PAGE_H - MARGIN - FONT_SIZE - 2,
      size: FONT_SIZE + 1,
      font: bold,
      color: columns[c].side === "aff" ? AFF : NEG,
    });
    c += span;
  }
}

function drawFlowSheet(doc: PDFDocument, font: PDFFont, bold: PDFFont, es: ExportSheet, round: Round): void {
  const columns = es.columns;
  const cols = Math.max(1, columns.length);
  const colW = (PAGE_W - 2 * MARGIN) / cols;
  const rowH = measureRowHeights(es.cells, es.rowCount, colW, font);
  const bodyTop = PAGE_H - MARGIN - HEADER_H;
  const bodyBottom = MARGIN;

  const pageStarts: number[] = [0];
  let cursor = bodyTop;
  for (let r = 0; r < es.rowCount; r++) {
    if (cursor - rowH[r] < bodyBottom && r !== pageStarts[pageStarts.length - 1]) {
      pageStarts.push(r);
      cursor = bodyTop;
    }
    cursor -= rowH[r];
  }

  const rowTopOnPage: number[] = new Array(es.rowCount).fill(0);
  const rowPage: number[] = new Array(es.rowCount).fill(0);
  let pageIdx = 0, top = bodyTop;
  for (let r = 0; r < es.rowCount; r++) {
    if (pageIdx + 1 < pageStarts.length && pageStarts[pageIdx + 1] === r) { pageIdx++; top = bodyTop; }
    rowTopOnPage[r] = top;
    rowPage[r] = pageIdx;
    top -= rowH[r];
  }

  const pages: PDFPage[] = [];
  const pageCount = pageStarts.length;
  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawText(es.sheet.title, { x: MARGIN, y: PAGE_H - MARGIN + 6, size: 10, font: bold, color: INK });
    drawColumnHeaders(page, bold, columns, colW);
    pages.push(page);
  }

  // Each cell is anchored to its start row's page. Pagination breaks at any leaf
  // row, so a multi-row span (a parent tag) can be split from its lower rows
  // across a page boundary — accepted graceful degradation, like group brackets.
  for (const cell of es.cells) {
    const page = pages[rowPage[cell.row]];
    const x = MARGIN + cell.col * colW + CELL_PAD;
    const yTop = rowTopOnPage[cell.row] - FONT_SIZE - CELL_PAD;
    const lines = wrap(prefixed(cell), font, FONT_SIZE, colW - 2 * CELL_PAD);
    const f = cell.bold ? bold : font;
    lines.forEach((ln, li) => {
      const y = yTop - li * LINE_H;
      page.drawText(ln, { x, y, size: FONT_SIZE, font: f, color: cell.dropped ? NEG : INK });
      if (cell.crossed) {
        const w = f.widthOfTextAtSize(ln, FONT_SIZE);
        page.drawLine({ start: { x, y: y + FONT_SIZE * 0.3 }, end: { x: x + w, y: y + FONT_SIZE * 0.3 }, thickness: 0.5, color: INK });
      }
    });
  }

  const cellByNode = new Map(es.cells.map((c) => [c.nodeId, c] as const));
  for (const group of round.groups.filter((g) => g.sheetId === es.sheet.id)) {
    const members = group.memberIds.map((id) => cellByNode.get(id)).filter(Boolean) as ExportCell[];
    if (members.length === 0) continue;
    const byPage = new Map<number, ExportCell[]>();
    for (const m of members) {
      const pg = rowPage[m.row];
      const arr = byPage.get(pg) ?? [];
      arr.push(m);
      byPage.set(pg, arr);
    }
    for (const [pg, ms] of byPage) {
      const page = pages[pg];
      const col = ms[0].col;
      const x = MARGIN + col * colW + 1;
      const yTopRow = Math.max(...ms.map((m) => rowTopOnPage[m.row]));
      const yBotRow = Math.min(...ms.map((m) => rowTopOnPage[m.row] - rowH[m.row]));
      page.drawLine({ start: { x, y: yTopRow }, end: { x, y: yBotRow }, thickness: 0.6, color: MUTED });
      if (group.label) page.drawText(group.label, { x: x + 2, y: yBotRow + 1, size: FONT_SIZE - 1, font, color: MUTED });
    }
  }
}

function drawCxSheet(doc: PDFDocument, font: PDFFont, bold: PDFFont, es: ExportSheet, round: Round): void {
  const periods = cxPeriods(round);
  const colW = (PAGE_W - 2 * MARGIN) / 2;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawText(es.sheet.title, { x: MARGIN, y: PAGE_H - MARGIN + 6, size: 10, font: bold, color: INK });
  let y = PAGE_H - MARGIN - HEADER_H;

  const ensure = (need: number) => {
    if (y - need < MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN - HEADER_H; }
  };

  for (const period of periods) {
    if (period.pairs.length === 0) continue;
    ensure(LINE_H * 2);
    page.drawText(period.label, { x: MARGIN, y, size: FONT_SIZE + 2, font: bold, color: INK });
    y -= LINE_H + 4;
    page.drawText("Question", { x: MARGIN, y, size: FONT_SIZE, font: bold, color: NEG });
    page.drawText("Response", { x: MARGIN + colW, y, size: FONT_SIZE, font: bold, color: AFF });
    y -= LINE_H + 2;
    for (const pair of period.pairs) {
      const qLines = wrap(pair.question, font, FONT_SIZE, colW - 2 * CELL_PAD);
      const rLines = wrap(pair.response, font, FONT_SIZE, colW - 2 * CELL_PAD);
      const rows = Math.max(qLines.length, rLines.length);
      ensure(rows * LINE_H + 4);
      for (let i = 0; i < rows; i++) {
        if (qLines[i]) page.drawText(qLines[i], { x: MARGIN, y: y - i * LINE_H, size: FONT_SIZE, font, color: INK });
        if (rLines[i]) page.drawText(rLines[i], { x: MARGIN + colW, y: y - i * LINE_H, size: FONT_SIZE, font, color: INK });
      }
      y -= rows * LINE_H + 4;
    }
    y -= 6;
  }
}

export async function buildPdf(round: Round, opts: ExportOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  drawCover(doc.addPage([PAGE_W, PAGE_H]), font, bold, round);

  for (const es of buildExportSheets(round, opts)) {
    if (es.sheet.kind === "cx") drawCxSheet(doc, font, bold, es, round);
    else drawFlowSheet(doc, font, bold, es, round);
  }
  return doc.save();
}

export async function downloadPdf(round: Round, opts: ExportOptions): Promise<void> {
  const bytes = await buildPdf(round, opts);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, "pdf"));
}
