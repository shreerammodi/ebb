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
        hot.updateSettings({
            data: padGrid(sheet.data, cols.length, MIN_ROWS),
            ...headerSettings(sheet, cols),
        });
        applyMeta(hot, sheet.meta);
        hot.render();
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
