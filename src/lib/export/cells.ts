/**
 * Bridges the flow model to placed export cells consumed by the Excel
 * exporter. One ExportSheet per app sheet; cells carry the same row/col the
 * on-screen grid uses, with bold flattened from cell meta. (In export code,
 * "sheet" is the app's FlowSheet; Excel tabs are called worksheets.)
 */

import { columnsForFlowSheet, type SpeechCol } from "@/lib/grid/flowColumns";
import { sortedSheets, type FlowRound, type FlowSheet } from "@/lib/model/flow";

export interface ExportCell {
    /** 0-based column index within the sheet's VISIBLE columns. */
    col: number;
    /** Speech name (used by Excel to resolve the template column). */
    speechName: string;
    /** 0-based body row (header excluded). */
    row: number;
    /** Number of grid rows this cell spans. */
    rowSpan: number;
    /** Display text. */
    text: string;
    /** Emphasis. */
    bold: boolean;
    /** conceded -> strikethrough; unimplemented, so always false. */
    crossed: boolean;
    /** extended -> arrow marker; unimplemented, so always false. */
    extended: boolean;
}

export interface ExportSheet {
    sheet: FlowSheet;
    /** The visible speech columns for this sheet. */
    columns: SpeechCol[];
    cells: ExportCell[];
    /** Number of body rows the flow occupies. */
    rowCount: number;
}

export function buildExportSheets(round: FlowRound): ExportSheet[] {
    return sortedSheets(round).map((sheet) => {
        const columns = columnsForFlowSheet(round, sheet);
        const cells: ExportCell[] = [];
        sheet.data.forEach((row, r) => {
            row.forEach((text, c) => {
                if (text == null || text.trim() === "" || c >= columns.length) return;
                const m = sheet.meta[`${r},${c}`];
                cells.push({
                    col: c,
                    speechName: columns[c].name,
                    row: r,
                    rowSpan: 1,
                    text,
                    bold: m?.bold ?? false,
                    crossed: false,
                    extended: false,
                });
            });
        });
        const rowCount = cells.reduce((m, c) => Math.max(m, c.row + 1), 0);
        return { sheet, columns, cells, rowCount };
    });
}
