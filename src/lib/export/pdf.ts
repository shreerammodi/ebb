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

const AFF = rgb(0.09, 0.55, 0.82);
const NEG = rgb(0.78, 0.16, 0.16);
const INK = rgb(0.1, 0.1, 0.1);

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

  speeches.forEach((s, c) => {
    page.drawText(s.name, {
      x: MARGIN + c * colW + 2,
      y: topY - FONT_SIZE - 2,
      size: FONT_SIZE + 1,
      font: boldFont,
      color: s.side === 'aff' ? AFF : NEG,
    });
  });

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

  if (round.sheets.length === 0) doc.addPage([PAGE_W, PAGE_H]);

  return doc.save();
}

export async function downloadPdf(round: Round): Promise<void> {
  const bytes = await buildPdf(round);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, 'pdf'));
}
