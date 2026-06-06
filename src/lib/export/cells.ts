/**
 * Bridges the round model to placed export cells used by both the Excel and PDF
 * exporters. One ExportSheet per flow sheet; cells carry the same row/col the
 * on-screen grid uses (via columnsForSheet / CX_COLUMNS), plus numbering overlay,
 * flattened decorations, drop flags, and node identity for group brackets.
 */

import type { Round, Sheet, Speech } from "@/lib/model/types";
import { buildLayout } from "@/lib/grid/layout";
import { columnsForSheet } from "@/lib/grid/columns";
import { CX_COLUMNS } from "@/lib/model/cxColumns";
import { numberFor } from "@/lib/model/numbering";
import { detectDrops } from "@/lib/model/drops";
import type { ExportOptions } from "./options";

export interface ExportCell {
  /** Source node id (lets the PDF match ArgGroup memberIds). */
  nodeId: string;
  /** 0-based column index within the sheet's VISIBLE columns. */
  col: number;
  /** Speech name (used by Excel to resolve the template column). */
  speechName: string;
  /** 0-based body row (header excluded). */
  row: number;
  /** Number of leaf rows this cell spans. */
  rowSpan: number;
  /** Display text, numbering prefix applied when autoNumber is on. */
  text: string;
  /** Emphasis. */
  bold: boolean;
  /** conceded → strikethrough. */
  crossed: boolean;
  /** extended → arrow marker. */
  extended: boolean;
  /** Dropped (only true when labelDrops is on; PDF renders, Excel ignores). */
  dropped: boolean;
}

export interface ExportSheet {
  sheet: Sheet;
  /** The visible speech columns for this sheet (flow → columnsForSheet, cx → CX_COLUMNS). */
  columns: Speech[];
  cells: ExportCell[];
  /** Number of body rows the flow occupies. */
  rowCount: number;
}

export function buildExportSheets(round: Round, opts: ExportOptions): ExportSheet[] {
  return round.sheets
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sheet) => {
      const columns = sheet.kind === "cx" ? CX_COLUMNS : columnsForSheet(round.format, sheet);
      const sheetNodes = round.nodes.filter((n) => n.sheetId === sheet.id);
      const { placed, totalRows } = buildLayout(sheetNodes, columns);
      const droppedIds =
        opts.labelDrops && sheet.kind !== "cx"
          ? new Set(detectDrops(sheetNodes, round.format, sheet.id))
          : new Set<string>();

      const cells: ExportCell[] = placed.map((p) => {
        const num = opts.autoNumber ? numberFor(sheetNodes, p.node.id) : null;
        const prefix = num !== null ? `${num}. ` : "";
        return {
          nodeId: p.node.id,
          col: p.col,
          speechName: columns[p.col]?.name ?? "",
          row: p.startRow,
          rowSpan: p.rowSpan,
          text: prefix + p.node.text,
          bold: p.node.bold,
          crossed: p.node.statuses.includes("conceded"),
          extended: p.node.statuses.includes("extended"),
          dropped: droppedIds.has(p.node.id),
        };
      });

      return { sheet, columns, cells, rowCount: totalRows };
    });
}
