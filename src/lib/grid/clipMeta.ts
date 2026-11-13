/**
 * Decorations that travel with a copy. Handsontable's clipboard carries text
 * only, so a card copied or cut and pasted elsewhere would arrive bare. The
 * copied block's classes and provenance are held here, beside the text they
 * belong to, and a paste whose text is that same block lays them back down.
 *
 * Text pasted from anywhere else does not match and pastes plain. The hold is
 * per window: the system clipboard never sees it.
 */

import type { CellSource } from "@/lib/model/flow";

import type { CellGrid, PasteShift } from "./cellShift";

interface HeldCell {
    className: string;
    source?: CellSource;
}

interface Held {
    text: string[][];
    cells: HeldCell[][];
}

/** Handsontable's copy range, as `beforeCopy` and `beforeCut` hand it out. */
export interface CopyRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

let held: Held | null = null;

// The clipboard's HTML table hands a cell's line breaks back as CRLF.
const normalize = (data: readonly (readonly unknown[])[]) =>
    data.map((row) => row.map((v) => (v == null ? "" : String(v).replace(/\r\n?/g, "\n"))));

/**
 * `beforeCopy` / `beforeCut`: holds the decorations of the copied block. A
 * multi-range copy has no single block to lay back down, so it holds nothing.
 */
export function holdClip(
    grid: CellGrid,
    ranges: readonly CopyRange[],
    data: readonly (readonly unknown[])[],
): void {
    held = null;
    if (ranges.length !== 1) return;
    const { startRow, startCol, endRow, endCol } = ranges[0];
    const cells: HeldCell[][] = [];
    for (let r = startRow; r <= endRow; r++) {
        const row: HeldCell[] = [];
        for (let c = startCol; c <= endCol; c++) {
            const meta = grid.getCellMeta(r, c);
            const source = meta.source as CellSource | undefined;
            row.push({ className: (meta.className ?? "") as string, ...(source && { source }) });
        }
        cells.push(row);
    }
    held = { text: normalize(data), cells };
}

/** Whether `data`, about to be pasted, is the held block's own text. */
export function clipMatches(data: readonly (readonly unknown[])[]): boolean {
    if (!held) return false;
    const text = normalize(data);
    return (
        text.length === held.text.length &&
        text.every(
            (row, r) =>
                row.length === held!.text[r].length && row.every((v, c) => v === held!.text[r][c]),
        )
    );
}

/**
 * Lays the held decorations over the pasted block at `at`, repeating them
 * across a selection larger than the block as the paste repeats its text.
 * Read-only cells and cells past the grid's edge are left alone. Returns the
 * cells it wrote.
 */
export function applyClip(grid: CellGrid, at: PasteShift): [row: number, col: number][] {
    if (!held) return [];
    const { cells } = held;
    const rows = Math.min(at.row + at.height, grid.countRows());
    const cols = Math.min(at.col + at.width, grid.countCols());
    const touched: [number, number][] = [];
    for (let r = at.row; r < rows; r++) {
        for (let c = at.col; c < cols; c++) {
            if ((grid.getCellMeta(r, c) as { readOnly?: boolean }).readOnly) continue;
            const line = cells[(r - at.row) % cells.length];
            const cell = line[(c - at.col) % line.length];
            grid.setCellMeta(r, c, "className", cell.className);
            grid.setCellMeta(r, c, "source", cell.source);
            touched.push([r, c]);
        }
    }
    return touched;
}

/** Drops the held block. Tests call this between grids. */
export function resetClip(): void {
    held = null;
}
