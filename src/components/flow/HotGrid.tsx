"use client";

import { HotTable } from "@handsontable/react-wrapper";
import type { HotTableRef } from "@handsontable/react-wrapper";
import type Handsontable from "handsontable";
import { registerAllModules } from "handsontable/registry";
import { memo, useCallback, useEffect, useRef } from "react";

import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

import { executeCommand } from "@/lib/commands/commands";
import { classNameToMeta, metaToClassName, padGrid, trimGrid } from "@/lib/grid/codec";
import { columnsForFlowSheet, type SpeechCol } from "@/lib/grid/flowColumns";
import { setActiveHot } from "@/lib/grid/hotInstance";
import type { CellMeta, FlowSheet } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

registerAllModules();

const MIN_ROWS = 40;
const CONTEXT_MENU = ["row_above", "row_below", "remove_row"] as const;

const ARROW_DELTAS: Record<string, { dr: number; dc: number }> = {
    ArrowUp: { dr: -1, dc: 0 },
    ArrowDown: { dr: 1, dc: 0 },
    ArrowLeft: { dr: 0, dc: -1 },
    ArrowRight: { dr: 0, dc: 1 },
};

/**
 * Excel-style Cmd/Ctrl+Arrow: from a filled cell adjacent to a filled cell,
 * stop at the end of that contiguous run; otherwise skip empties and land on
 * the next filled cell, or the sheet edge if none remains.
 */
function smartJump(
    hot: Handsontable,
    row: number,
    col: number,
    { dr, dc }: { dr: number; dc: number },
): { row: number; col: number } {
    const maxR = hot.countRows() - 1;
    const maxC = hot.countCols() - 1;
    const inBounds = (r: number, c: number) => r >= 0 && r <= maxR && c >= 0 && c <= maxC;
    const filled = (r: number, c: number) => {
        const v = hot.getDataAtCell(r, c);
        return v != null && String(v).trim() !== "";
    };
    if (!inBounds(row + dr, col + dc)) return { row, col };

    let r = row;
    let c = col;
    if (filled(row, col) && filled(row + dr, col + dc)) {
        // Ride the filled run to its last cell.
        while (inBounds(r + dr, c + dc) && filled(r + dr, c + dc)) {
            r += dr;
            c += dc;
        }
    } else {
        // Skip empties to the next filled cell, else stop at the edge.
        r += dr;
        c += dc;
        while (inBounds(r + dr, c + dc) && !filled(r, c)) {
            r += dr;
            c += dc;
        }
    }
    return { row: r, col: c };
}

function collectMeta(hot: Handsontable): Record<string, CellMeta> {
    const meta: Record<string, CellMeta> = {};
    for (let r = 0; r < hot.countRows(); r++) {
        for (let c = 0; c < hot.countCols(); c++) {
            const m = classNameToMeta((hot.getCellMeta(r, c).className ?? "") as string);
            if (m) meta[`${r},${c}`] = m;
        }
    }
    return meta;
}

/** Clears stale decoration classes, then injects the sheet's stored meta. */
function applyMeta(hot: Handsontable, meta: Record<string, CellMeta>): void {
    for (let r = 0; r < hot.countRows(); r++) {
        for (let c = 0; c < hot.countCols(); c++) {
            const cls = (hot.getCellMeta(r, c).className ?? "") as string;
            if (cls && classNameToMeta(cls)) hot.setCellMeta(r, c, "className", "");
        }
    }
    for (const [key, m] of Object.entries(meta)) {
        const [r, c] = key.split(",").map(Number);
        hot.setCellMeta(r, c, "className", metaToClassName(m));
    }
}

/** Header settings per sheet: CX gets a period tier above Question/Response. */
function headerSettings(sheet: FlowSheet, cols: SpeechCol[]) {
    if (sheet.kind === "cx") {
        const groups: { label: string; colspan: number }[] = [];
        for (const col of cols) {
            const last = groups[groups.length - 1];
            if (last && last.label === col.group) last.colspan++;
            else groups.push({ label: col.group ?? "", colspan: 1 });
        }
        return {
            colHeaders: true,
            nestedHeaders: [groups, cols.map((c) => c.name)],
        } satisfies Partial<Handsontable.GridSettings>;
    }
    return {
        colHeaders: cols.map((c) => c.name),
        nestedHeaders: undefined,
    } satisfies Partial<Handsontable.GridSettings>;
}

/**
 * The single grid instance. `data` and `colHeaders` are deliberately NOT
 * JSX props: the react-wrapper re-applies every prop through updateSettings
 * on each re-render, which would wipe the live grid back to its initial
 * state. The sheet-switch effect below owns data, headers, and cell meta.
 * memo() keeps parent re-renders (store updates) away from the wrapper.
 */
export default memo(function HotGrid() {
    const activeSheetId = useFlowStore((s) => s.activeSheetId);
    const hotRef = useRef<HotTableRef>(null);
    const currentSheetIdRef = useRef<string | null>(null);
    const viewCache = useRef(new Map<string, { row: number; col: number }>());

    const snapshot = useCallback(() => {
        const hot = hotRef.current?.hotInstance;
        const sid = currentSheetIdRef.current;
        if (!hot || !sid) return;
        useFlowStore
            .getState()
            .updateSheetData(sid, trimGrid(hot.getData() as (string | null)[][]), collectMeta(hot));
    }, []);

    useEffect(() => {
        const hot = hotRef.current?.hotInstance ?? null;
        setActiveHot(hot, snapshot);
        if (hot) {
            // The app keymap owns undo/redo; strip the grid's own bindings so
            // Cmd/Ctrl+Z cannot fire twice.
            const grid = hot.getShortcutManager().getContext("grid");
            grid?.removeShortcutsByKeys(["control/meta", "z"]);
            grid?.removeShortcutsByKeys(["control/meta", "shift", "z"]);
        }
        return () => setActiveHot(null, null);
    }, [snapshot]);

    // Sheet switching swaps data/columns on the single instance.
    useEffect(() => {
        const hot = hotRef.current?.hotInstance;
        const round = useFlowStore.getState().round;
        if (!hot || !round || !activeSheetId) return;
        const sheet = round.sheets.find((s) => s.id === activeSheetId);
        if (!sheet) return;

        const prev = currentSheetIdRef.current;
        if (prev && prev !== sheet.id) {
            hot.getActiveEditor()?.finishEditing(true);
            const sel = hot.getSelectedLast();
            if (sel) viewCache.current.set(prev, { row: sel[0], col: sel[1] });
        }
        currentSheetIdRef.current = sheet.id;

        const cols = columnsForFlowSheet(sheet);
        // Coalesce the data/header swap and the per-cell meta loop into one
        // render instead of updateSettings' render plus an explicit one.
        hot.batch(() => {
            hot.updateSettings({
                data: padGrid(sheet.data, cols.length, MIN_ROWS),
                ...headerSettings(sheet, cols),
            });
            applyMeta(hot, sheet.meta);
        });
        const v = viewCache.current.get(sheet.id) ?? { row: 0, col: 0 };
        hot.selectCell(v.row, v.col);
    }, [activeSheetId]);

    const afterGetColHeader = useCallback((col: number, TH: HTMLTableCellElement) => {
        const round = useFlowStore.getState().round;
        const sid = currentSheetIdRef.current;
        const sheet = round?.sheets.find((s) => s.id === sid);
        if (!sheet || col < 0) return;
        const side = columnsForFlowSheet(sheet)[col]?.side;
        if (side) TH.classList.add(side === "aff" ? "hd-aff" : "hd-neg");
    }, []);

    // changes is null on loadData/updateSettings passes; snapshotting those
    // loops setState -> render -> afterChange forever.
    const afterChange = useCallback(
        (changes: unknown) => {
            if (changes) snapshot();
        },
        [snapshot],
    );

    const beforeKeyDown = useCallback(function (this: unknown, e: KeyboardEvent) {
        const hot = hotRef.current?.hotInstance;
        if (hot?.getActiveEditor()?.isOpened()) return;
        if (e.key === "[" || e.key === "]" || e.key === "?") {
            e.preventDefault();
            e.stopImmediatePropagation();
            executeCommand(
                e.key === "[" ? "sheet.prev" : e.key === "]" ? "sheet.next" : "help.open",
            );
            return;
        }
        const dir = ARROW_DELTAS[e.key];
        if (hot && (e.metaKey || e.ctrlKey) && dir) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const cur = hot.getSelectedRangeLast();
            if (!cur || cur.highlight.row == null || cur.highlight.col == null) return;
            const { row, col } = smartJump(hot, cur.highlight.row, cur.highlight.col, dir);
            if (e.shiftKey) hot.selection.setRangeEnd(hot._createCellCoords(row, col));
            else hot.selectCell(row, col);
        }
    }, []);

    return (
        <div className="ht-theme-main h-full min-h-0" data-testid="hot-grid">
            <HotTable
                ref={hotRef}
                rowHeaders={false}
                colWidths={280}
                wordWrap={true}
                autoRowSize={true}
                autoColumnSize={false}
                height="100%"
                minSpareRows={1}
                undo={true}
                outsideClickDeselects={false}
                contextMenu={CONTEXT_MENU as unknown as string[]}
                afterGetColHeader={afterGetColHeader}
                afterChange={afterChange}
                afterCreateRow={snapshot}
                afterRemoveRow={snapshot}
                beforeKeyDown={beforeKeyDown}
                licenseKey="non-commercial-and-evaluation"
            />
        </div>
    );
});
