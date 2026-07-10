/**
 * Insert paste: the setting that makes a paste push the target columns' cells
 * down rather than write over them.
 *
 * Handsontable's `shift_down` paste mode does that for cell *text*, but cell
 * meta stays anchored to its row index. This module moves the decoration
 * classes to match, so a bold tag pushed down by a paste does not leave its
 * bold behind on the cell that landed on top of it.
 */

/** The block a `shift_down` paste displaces, in visual grid coordinates. */
export interface PasteShift {
    row: number;
    col: number;
    width: number;
    height: number;
}

/**
 * The slice of Handsontable `shiftMetaDown` needs. The live grid satisfies it;
 * tests pass a plain object.
 */
export interface MetaGrid {
    countRows(): number;
    countCols(): number;
    getCellMeta(row: number, col: number): { className?: unknown };
    setCellMeta(row: number, col: number, key: "className", value: string): void;
}

/**
 * Moves each decoration class in the pasted columns down by `height`, leaving
 * the pasted block bare. Classes pushed past the last row fall off, as their
 * text does. Columns outside the pasted block keep their rows.
 *
 * Call this after the paste, once the grid has grown to hold the displaced rows.
 */
export function shiftMetaDown(hot: MetaGrid, { row, col, width, height }: PasteShift): void {
    const rows = hot.countRows();
    const lastCol = Math.min(col + width, hot.countCols());
    const moved: [number, number, string][] = [];

    for (let r = row; r < rows; r++) {
        for (let c = col; c < lastCol; c++) {
            const cls = (hot.getCellMeta(r, c).className ?? "") as string;
            if (!cls) continue;
            if (r + height < rows) moved.push([r + height, c, cls]);
            hot.setCellMeta(r, c, "className", "");
        }
    }
    // Every target row is below the cleared block, so no move undoes a clear.
    for (const [r, c, cls] of moved) hot.setCellMeta(r, c, "className", cls);
}
