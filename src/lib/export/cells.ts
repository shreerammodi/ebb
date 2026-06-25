/**
 * Bridges the round model to placed export cells consumed by the Excel exporter.
 * One ExportSheet per flow sheet; cells carry the same row/col the on-screen grid
 * uses (via columnsForSheet / CX_COLUMNS), plus numbering overlay, flattened
 * decorations, drop flags, and node identity for group brackets.
 */

import type { Round, Sheet, Speech } from "@/lib/model/types";
import { columnsForSheet } from "@/lib/grid/columns";
import { numberFor } from "@/lib/model/numbering";
import type { ExportOptions } from "./options";

export interface ExportCell {
    /** Source node id (ties a placed cell back to its model node / ArgGroup memberIds). */
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
}

export interface ExportSheet {
    sheet: Sheet;
    /** The visible speech columns for this sheet (flow → columnsForSheet, cx → CX_COLUMNS). */
    columns: Speech[];
    cells: ExportCell[];
    /** Number of body rows the flow occupies. */
    rowCount: number;
}

export function buildExportSheets(
    round: Round,
    opts: ExportOptions,
): ExportSheet[] {
    return round.sheets
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((sheet) => {
            const columns = columnsForSheet(round.format, sheet);
            const sheetNodes = round.nodes.filter(
                (n) => n.sheetId === sheet.id,
            );

            // Grid owns position: each node renders at its stored (col, row);
            // one node = one cell = one row (rowSpan is always 1).
            const cells: ExportCell[] = sheetNodes.flatMap((node) => {
                const col = columns.findIndex((s) => s.id === node.speechId);
                if (col === -1) return [];
                const num = opts.autoNumber
                    ? numberFor(sheetNodes, node.id)
                    : null;
                const prefix = num !== null ? `${num}. ` : "";
                return [
                    {
                        nodeId: node.id,
                        col,
                        speechName: columns[col]?.name ?? "",
                        row: node.row,
                        rowSpan: 1,
                        text: prefix + node.text,
                        bold: node.bold,
                        crossed: node.statuses.includes("conceded"),
                        extended: node.statuses.includes("extended"),
                    },
                ];
            });

            const rowCount = cells.reduce((m, c) => Math.max(m, c.row + 1), 0);
            return { sheet, columns, cells, rowCount };
        });
}
