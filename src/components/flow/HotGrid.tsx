"use client";

import { HotTable } from "@handsontable/react-wrapper";
import type { HotTableRef } from "@handsontable/react-wrapper";
import type Handsontable from "handsontable";
import { registerAllModules } from "handsontable/registry";
import { memo, useCallback, useEffect, useRef } from "react";

import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

import { executeCommand } from "@/lib/commands/commands";
import { shiftMetaDown, type PasteShift } from "@/lib/grid/cellShift";
import { classNameToMeta, metaToClassName, padGrid, trimGrid } from "@/lib/grid/codec";
import { columnsForFlowSheet, type SpeechCol } from "@/lib/grid/flowColumns";
import { getActiveHot, setActiveHot } from "@/lib/grid/hotInstance";
import {
    attachMetaUndo,
    onRedoStackChange,
    onUndoStackChange,
    restoreMetaRedo,
    restoreMetaUndo,
    snapshotClasses,
    type ClassEntry,
} from "@/lib/grid/metaUndo";
import {
    cellIsMoving,
    commitMove,
    isMovingIn,
    movingBlock,
    nudge,
    revertMove,
} from "@/lib/grid/moveSession";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { resolveCommand } from "@/lib/keymap/resolve";
import type { CellMeta, FlowSheet } from "@/lib/model/flow";
import { useFlowStore, ZOOM_STEP } from "@/lib/store/useFlowStore";

registerAllModules();

// Empty rows a sheet shows up front, so the cursor can arrow down into blank
// space to align an argument with the speech it answers. minSpareRows grows
// the grid further as cells past this fill, so it is headroom, not a cap; kept
// modest because every sheet switch re-renders and re-measures the full pad.
const MIN_ROWS = 250;
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

/** The visual columns a paste lands in, clamped to the grid. */
function pasteCols(hot: Handsontable, { col, width }: PasteShift): number[] {
    const last = Math.min(col + width, hot.countCols());
    return Array.from({ length: Math.max(last - col, 0) }, (_, i) => col + i);
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

/**
 * Clears the outgoing sheet's decoration cells, then injects the incoming
 * sheet's stored meta. `prevMeta` is the sheet being left; since every
 * className change is snapshotted back into a sheet's stored meta, its keys
 * are exactly the decorations live on the grid, so the clear touches only
 * those instead of every cell in the padded grid. `prevMeta` is null only
 * when the outgoing sheet is gone from the store (it was just deleted), where
 * the full grid must be scanned to catch its orphaned decorations.
 */
function applyMeta(
    hot: Handsontable,
    meta: Record<string, CellMeta>,
    prevMeta: Record<string, CellMeta> | null,
): void {
    if (prevMeta) {
        for (const key of Object.keys(prevMeta)) {
            if (key in meta) continue;
            const [r, c] = key.split(",").map(Number);
            hot.setCellMeta(r, c, "className", "");
        }
    } else {
        for (let r = 0; r < hot.countRows(); r++) {
            for (let c = 0; c < hot.countCols(); c++) {
                const cls = (hot.getCellMeta(r, c).className ?? "") as string;
                if (cls && classNameToMeta(cls)) hot.setCellMeta(r, c, "className", "");
            }
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
 * One grid instance for one pane. In split mode two instances coexist, one
 * per pane; the focused pane owns the shared active-grid singleton so
 * commands (undo, bold, row insert) reach the right one. `data` and
 * `colHeaders` are deliberately NOT JSX props: the react-wrapper re-applies
 * every prop through updateSettings on each re-render, which would wipe the
 * live grid back to its initial state. The sheet-switch effect below owns
 * data, headers, and cell meta. memo() keeps parent re-renders (store
 * updates) away from the wrapper.
 */
export default memo(function HotGrid({ sheetId, pane }: { sheetId: string; pane: 1 | 2 }) {
    const splitSheetId = useFlowStore((s) => s.splitSheetId);
    const focusedPane = useFlowStore((s) => s.focusedPane);
    const gridZoom = useFlowStore((s) => s.gridZoom);
    const isFocused = splitSheetId == null || focusedPane === pane;
    const hotRef = useRef<HotTableRef>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const currentSheetIdRef = useRef<string | null>(null);
    const viewCache = useRef(new Map<string, { row: number; col: number }>());
    // afterRenderer and afterGetColHeader run once per cell per render cycle, so
    // they index this instead of re-deriving the column list per cell. A sheet's
    // columns depend only on kind/group/startSpeechId, none of which change after
    // creation, so the sheet-switch effect is the only writer.
    const colsRef = useRef<SpeechCol[]>([]);

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
        if (hot) {
            // The app keymap owns undo/redo; strip the grid's own bindings so
            // Cmd/Ctrl+Z cannot fire twice.
            const grid = hot.getShortcutManager().getContext("grid");
            grid?.removeShortcutsByKeys(["control/meta", "z"]);
            grid?.removeShortcutsByKeys(["control/meta", "shift", "z"]);
        }
        return () => {
            if (getActiveHot() === hot) setActiveHot(null, null);
        };
    }, []);

    // Zoom scales the grid via CSS on the wrapper; Handsontable measures its
    // viewport once, so re-measure it against the new zoomed box or the last
    // rows/cols stay clipped or leave a gap.
    useEffect(() => {
        hotRef.current?.hotInstance?.refreshDimensions();
    }, [gridZoom]);

    // Mod+scroll zooms only the grid. Native listener (not React onWheel) so the
    // preventDefault sticks and the browser's own page zoom never fires. Trackpad
    // pinch also arrives as ctrl+wheel, so both modifiers count.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            useFlowStore.getState().zoomGrid(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    // The focused pane owns the singleton so commands (undo, bold, rows) hit it.
    const wasFocusedRef = useRef(isFocused);
    useEffect(() => {
        if (!isFocused) {
            wasFocusedRef.current = false;
            return;
        }
        const hot = hotRef.current?.hotInstance ?? null;
        setActiveHot(hot, snapshot);
        const gainedFocus = !wasFocusedRef.current;
        wasFocusedRef.current = true;
        // A keyboard focus switch (Meta/Ctrl+h/l) moves the accent and command
        // target to this pane; pull the grid's DOM focus too so typing edits here.
        // Split mode only: single-pane focus never transitions and the click path
        // already holds focus.
        if (gainedFocus && useFlowStore.getState().splitSheetId != null && hot) {
            const sel = hot.getSelectedLast();
            const id = requestAnimationFrame(() => hot.selectCell(sel?.[0] ?? 0, sel?.[1] ?? 0));
            return () => cancelAnimationFrame(id);
        }
    }, [isFocused, snapshot]);

    // Sheet switching swaps data/columns on this pane's instance.
    useEffect(() => {
        const hot = hotRef.current?.hotInstance;
        const round = useFlowStore.getState().round;
        if (!hot || !round || !sheetId) return;
        const sheet = round.sheets.find((s) => s.id === sheetId);
        if (!sheet) return;

        // A sheet swap would leave the preview mutations written into a sheet the
        // session never snapshotted, so unwind it against the sheet it belongs to.
        if (isMovingIn(hot)) revertMove();

        const prev = currentSheetIdRef.current;
        // The decorations live on the grid belong to the sheet being left; clear
        // exactly those. null when that sheet is gone (just deleted) or on the
        // first swap, cueing applyMeta to scan or skip.
        const prevMeta =
            prev && prev !== sheet.id
                ? (round.sheets.find((s) => s.id === prev)?.meta ?? null)
                : {};
        if (prev && prev !== sheet.id) {
            hot.getActiveEditor()?.finishEditing(true);
            const sel = hot.getSelectedLast();
            if (sel) viewCache.current.set(prev, { row: sel[0], col: sel[1] });
        }
        currentSheetIdRef.current = sheet.id;

        const cols = columnsForFlowSheet(sheet);
        colsRef.current = cols;
        // Coalesce the data/header swap and the per-cell meta loop into one
        // render instead of updateSettings' render plus an explicit one.
        hot.batch(() => {
            hot.updateSettings({
                data: padGrid(sheet.data, cols.length, MIN_ROWS),
                ...headerSettings(sheet, cols),
            });
            applyMeta(hot, sheet.meta, prevMeta);
        });
        const v = viewCache.current.get(sheet.id) ?? { row: 0, col: 0 };
        hot.selectCell(v.row, v.col);
    }, [sheetId]);

    // Clicking or arrowing into a pane focuses it (so keystrokes route here).
    const afterSelectionEnd = useCallback(() => {
        setActiveHot(hotRef.current?.hotInstance ?? null, snapshot);
        const { splitSheetId, focusedPane, focusPane } = useFlowStore.getState();
        if (splitSheetId != null && focusedPane !== pane) focusPane(pane);
    }, [pane, snapshot]);

    // Search palette jump: declared after the sheet-switch effect so that when
    // both fire in one commit (a cross-sheet jump) this selection wins. The rAF
    // defers past Radix's focus restore so the grid keeps keyboard focus.
    const revealTarget = useFlowStore((s) => s.revealTarget);
    useEffect(() => {
        if (!revealTarget || revealTarget.sheetId !== sheetId) return;
        const id = requestAnimationFrame(() => {
            const hot = hotRef.current?.hotInstance;
            hot?.selectCell(revealTarget.row, revealTarget.col);
        });
        return () => cancelAnimationFrame(id);
    }, [revealTarget, sheetId]);

    // Speech switch: seed every sheet's remembered cursor to row 0 of the
    // chosen speech's column, then select it on this pane only when this
    // pane is focused; the other pane just gets the seed. Declared after the
    // sheet-switch effect so its rAF selection wins when a switch also
    // changes activeSheetId in the same commit (single-pane mode).
    const speechTarget = useFlowStore((s) => s.speechTarget);
    useEffect(() => {
        if (!speechTarget) return;
        const round = useFlowStore.getState().round;
        if (!round) return;
        const { speechId } = speechTarget;
        for (const sheet of round.sheets) {
            const col = columnsForFlowSheet(sheet).findIndex((c) => c.id === speechId);
            if (col >= 0) viewCache.current.set(sheet.id, { row: 0, col });
        }
        if (!isFocused) return;
        // The rAF defers past the dropdown's focus restore so the grid keeps
        // keyboard focus.
        const id = requestAnimationFrame(() => {
            const hot = hotRef.current?.hotInstance;
            const sheet = round.sheets.find((s) => s.id === currentSheetIdRef.current);
            if (!hot || !sheet) return;
            const col = columnsForFlowSheet(sheet).findIndex((c) => c.id === speechId);
            hot.selectCell(0, col >= 0 ? col : 0);
        });
        return () => cancelAnimationFrame(id);
    }, [speechTarget, isFocused]);

    const afterGetColHeader = useCallback((col: number, TH: HTMLTableCellElement) => {
        const side = col < 0 ? undefined : colsRef.current[col]?.side;
        if (side) TH.classList.add(side === "aff" ? "hd-aff" : "hd-neg");
    }, []);

    // Cells inherit their column header's side color: blue for aff, red for neg.
    // The move tint is a class on the TD alone, never cellMeta, so it cannot
    // leak into a saved sheet through collectMeta.
    const afterRenderer = useCallback((TD: HTMLTableCellElement, row: number, col: number) => {
        const side = colsRef.current[col]?.side;
        if (side) TD.classList.add(side === "aff" ? "cell-aff" : "cell-neg");
        if (cellIsMoving(hotRef.current?.hotInstance ?? null, row, col)) {
            TD.classList.add("cell-moving");
        }
    }, []);

    // changes is null on loadData/updateSettings passes; snapshotting those
    // loops setState -> render -> afterChange forever.
    const afterChange = useCallback(
        (changes: unknown) => {
            if (changes) snapshot();
        },
        [snapshot],
    );

    // Insert-paste: the shift_down populate moves text but not decorations, so
    // the displaced classes are re-laid once the grid has grown. The hook's own
    // `coords` argument describes the COPY range, not the paste target, so the
    // target comes from the selection - the same place Handsontable reads it.
    const insertPaste = useFlowStore((s) => s.insertPaste);
    const pasteShift = useRef<PasteShift | null>(null);
    const pasteClasses = useRef<ClassEntry[]>([]);

    const beforePaste = useCallback(
        (data: string[][]) => {
            pasteShift.current = null;
            const hot = hotRef.current?.hotInstance;
            const sel = hot?.getSelectedRangeLast();
            if (!insertPaste || !hot || !sel || data.length === 0) return;
            const tl = sel.getTopLeftCorner();
            const br = sel.getBottomRightCorner();
            if (tl.row == null || tl.col == null || br.row == null || br.col == null) return;
            // A selection wider or taller than the clipboard block repeats it.
            const shift = {
                row: tl.row,
                col: tl.col,
                width: Math.max(data[0].length, br.col - tl.col + 1),
                height: Math.max(data.length, br.row - tl.row + 1),
            };
            pasteShift.current = shift;
            pasteClasses.current = snapshotClasses(hot, pasteCols(hot, shift));
        },
        [insertPaste],
    );

    const afterPaste = useCallback(() => {
        const shift = pasteShift.current;
        pasteShift.current = null;
        const hot = hotRef.current?.hotInstance;
        if (!hot || !shift) return;
        shiftMetaDown(hot, shift);
        const cols = pasteCols(hot, shift);
        attachMetaUndo({
            cols,
            before: pasteClasses.current,
            after: snapshotClasses(hot, cols),
        });
        hot.render();
        // afterChange already snapshotted the shifted text with the old meta.
        snapshot();
    }, [snapshot]);

    // Returning false is Handsontable's documented way to cancel an undo push.
    // The session's live preview mutations never reach the stack; its commit,
    // fired after the session closes, is the one action recorded.
    const beforeUndoStackChange = useCallback(
        () => (isMovingIn(hotRef.current?.hotInstance ?? null) ? false : undefined),
        [],
    );

    // Handsontable's undo stack carries text but not decorations; metaUndo
    // reunites them against the action it recorded.
    const afterUndo = useCallback(() => {
        const hot = hotRef.current?.hotInstance;
        if (!hot || !restoreMetaUndo(hot)) return;
        hot.render();
        snapshot();
    }, [snapshot]);

    const afterRedo = useCallback(() => {
        const hot = hotRef.current?.hotInstance;
        if (!hot || !restoreMetaRedo(hot)) return;
        hot.render();
        snapshot();
    }, [snapshot]);

    const beforeKeyDown = useCallback(
        function (this: unknown, e: KeyboardEvent) {
            const hot = hotRef.current?.hotInstance;
            if (hot?.getActiveEditor()?.isOpened()) return;

            // Move mode is modal: Up and Down nudge the block, Meta/Ctrl with them
            // lands it against the next filled cell, Enter commits, Esc reverts, and
            // every other key is swallowed so nothing edits the grid mid-move.
            // stopImmediate is what swallows them: it keeps the chord from reaching
            // useKeymap's window listener, where an undo would unwind an edit made
            // before the session while its live preview sat on top of the grid.
            if (hot && isMovingIn(hot)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (e.key === "Escape") {
                    revertMove();
                    hot.render();
                } else if (e.key === "Enter") {
                    hot.batch(() => commitMove());
                    hot.render();
                    snapshot();
                } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    const dr = e.key === "ArrowDown" ? 1 : -1;
                    const block = movingBlock()!;
                    let delta = dr;
                    if (e.metaKey || e.ctrlKey) {
                        // The leading edge is the row that meets the next filled cell.
                        const lead =
                            dr > 0 ? block.blockStart + block.height - 1 : block.blockStart;
                        delta = smartJump(hot, lead, block.cols[0], { dr, dc: 0 }).row - lead;
                    }
                    nudge(delta);
                    const moved = movingBlock()!;
                    hot.selectCells([
                        [
                            moved.blockStart,
                            moved.cols[0],
                            moved.blockStart + moved.height - 1,
                            moved.cols[moved.cols.length - 1],
                        ],
                    ]);
                    hot.render();
                }
                return false;
            }

            // A chord bound to an app command must run as a command, not type into
            // the grid. With no Ctrl/Meta modifier Handsontable "fast edits" the
            // selected cell - opening an empty editor whose later commit wipes the
            // cell (e.g. Alt+\ split-toggle, or the bare [ ] ? sheet keys). Run the
            // command here and stop the grid touching the cell; stopImmediate keeps
            // useKeymap from firing it a second time. Ctrl/Meta chords never
            // fast-edit, so the window keymap owns them.
            if (!e.metaKey && !e.ctrlKey) {
                const commandId = resolveCommand(
                    effectiveKeymap(useFlowStore.getState().keymapOverrides),
                    {
                        key: e.key,
                        code: e.code,
                        metaKey: false,
                        ctrlKey: false,
                        altKey: e.altKey,
                        shiftKey: e.shiftKey,
                    },
                );
                if (commandId) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    executeCommand(commandId);
                    return;
                }
            }
            const dir = ARROW_DELTAS[e.key];
            if (hot && (e.metaKey || e.ctrlKey) && dir) {
                e.preventDefault();
                const cur = hot.getSelectedRangeLast();
                // Shift-extend jumps from the range's moving edge so repeated presses
                // walk outward; a plain jump starts from the active cell.
                const origin = e.shiftKey ? cur?.to : cur?.highlight;
                if (!origin || origin.row == null || origin.col == null) return false;
                const { row, col } = smartJump(hot, origin.row, origin.col, dir);
                if (e.shiftKey) hot.selection.setRangeEnd(hot._createCellCoords(row, col));
                else hot.selectCell(row, col);
                // Returning false is Handsontable's contract for suppressing its own
                // key handling; native stopImmediatePropagation does not, since the
                // shortcut recorder checks its private isImmediatePropagationEnabled
                // flag rather than the DOM event's state.
                return false;
            }
        },
        [snapshot],
    );

    return (
        // ht-blurred hides this pane's cell-selection marker while its cursor
        // stays in memory, so only the focused pane shows an active cell.
        <div
            ref={wrapRef}
            className={`ht-theme-main h-full min-h-0 overflow-hidden${isFocused ? "" : " ht-blurred"}`}
            data-testid="hot-grid"
        >
            {/* zoom scales the grid's content and layout uniformly. A zoomed
                width/height:100% child still fills this pane exactly (CSS zoom
                resolves the percentage against the pane), and Handsontable reads
                its own clientHeight (pane / zoom) to fill the visible box, so its
                scrollbars stay at the pane edges instead of overflowing. */}
            <div style={{ zoom: gridZoom, width: "100%", height: "100%" }}>
                <HotTable
                    ref={hotRef}
                    rowHeaders={false}
                    colWidths={280}
                    wordWrap={true}
                    autoRowSize={true}
                    autoColumnSize={false}
                    height="100%"
                    minSpareRows={1}
                    enterBeginsEditing={false}
                    undo={true}
                    outsideClickDeselects={false}
                    contextMenu={CONTEXT_MENU as unknown as string[]}
                    copyPaste={{ pasteMode: insertPaste ? "shift_down" : "overwrite" }}
                    afterGetColHeader={afterGetColHeader}
                    afterRenderer={afterRenderer}
                    afterChange={afterChange}
                    beforePaste={beforePaste}
                    afterPaste={afterPaste}
                    beforeUndoStackChange={beforeUndoStackChange}
                    afterUndoStackChange={onUndoStackChange}
                    afterRedoStackChange={onRedoStackChange}
                    afterUndo={afterUndo}
                    afterRedo={afterRedo}
                    afterCreateRow={snapshot}
                    afterRemoveRow={snapshot}
                    afterSelectionEnd={afterSelectionEnd}
                    beforeKeyDown={beforeKeyDown}
                    licenseKey="non-commercial-and-evaluation"
                />
            </div>
        </div>
    );
});
