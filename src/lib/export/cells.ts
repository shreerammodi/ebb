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
