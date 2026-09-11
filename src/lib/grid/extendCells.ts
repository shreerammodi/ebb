import type { CellChange, CellGrid } from "@/lib/grid/cellShift";
import { shiftSpan } from "@/lib/grid/cellShift";
import { KICKED_CLASS } from "@/lib/grid/codec";
import type { GridCol } from "@/lib/grid/colSpace";
import type { SpeechCol } from "@/lib/grid/flowColumns";
import type { CellSource } from "@/lib/model/flow";

export interface ExtendRunInput {
    sourceCol: GridCol;
    targetCol: GridCol;
    startRow: number;
    height: number;
}

export function nextSameSideColumn(
    columns: readonly SpeechCol[],
    sourceCol: number,
): number | null {
    const source = columns[sourceCol];
    if (!source) return null;
    const offset = columns.slice(sourceCol + 1).findIndex((column) => column.side === source.side);
    return offset === -1 ? null : sourceCol + offset + 1;
}

export function extensionRequiredRows(
    grid: CellGrid,
    targetCol: GridCol,
    startRow: number,
    height: number,
): number {
    let last = -1;
    for (let row = startRow; row < grid.countRows(); row++) {
        const text = grid.getDataAtCell(row, targetCol);
        const meta = grid.getCellMeta(row, targetCol);
        if (text != null && text !== "" || meta.className || meta.source) last = row;
    }

    return Math.max(grid.countRows(), last + 1 + height);
}

export function extendRun(grid: CellGrid, input: ExtendRunInput): CellChange[] {
    const { sourceCol, targetCol, startRow, height } = input;
    const copied = Array.from({ length: height }, (_, index) => {
        const row = startRow + index;
        const meta = grid.getCellMeta(row, sourceCol);
        return {
            text: grid.getDataAtCell(row, sourceCol) as string | null,
            className: ((meta.className ?? "") as string)
                .split(/\s+/)
                .filter((token) => token && token !== KICKED_CLASS)
                .join(" "),
            source: meta.source as CellSource | undefined,
        };
    });

    const shifted = shiftSpan(grid, targetCol, startRow, grid.countRows(), height);
    const copiedChanges = copied.map(({ text, className, source }, index) => {
        const row = startRow + index;
        grid.setCellMeta(row, targetCol, "className", className);
        grid.setCellMeta(row, targetCol, "source", source);
        return [row, targetCol, text] as CellChange;
    });

    return [...shifted, ...copiedChanges];
}
