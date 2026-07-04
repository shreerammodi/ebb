/**
 * Command handlers for the Handsontable-based editor.
 *
 * `executeCommand` reads and writes `useFlowStore.getState()` and reaches the
 * live grid through the hotInstance registry. All handlers silently no-op
 * when the round, sheet, or grid is missing so the keyboard layer can fire
 * commands unconditionally.
 */

import { BOLD_CLASS, HIGHLIGHT_CLASS, toggleClassToken } from "@/lib/grid/codec";
import { getActiveHot, notifyGridMutated } from "@/lib/grid/hotInstance";
import { sortedSheets } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import type { CommandId } from "./registry";

/** Jumps to the Nth (1-indexed, order-sorted) flow sheet, no-op if out of range. */
function jumpToSheet(n: number): void {
    const { round, setActiveSheet } = useFlowStore.getState();
    if (!round) return;
    const sheets = sortedSheets(round).filter((s) => s.kind !== "cx");
    const target = sheets[n - 1];
    if (target) setActiveSheet(target.id);
}

/**
 * Toggles a decoration class over every cell of the current selection. The
 * target state comes from the FIRST cell (missing the class = add to all),
 * so mixed ranges converge instead of flip-flopping per cell.
 */
function toggleDecoration(token: typeof BOLD_CLASS | typeof HIGHLIGHT_CLASS): void {
    const hot = getActiveHot();
    const ranges = hot?.getSelectedRange();
    if (!hot || !ranges || ranges.length === 0) return;

    const first = ranges[0].highlight;
    const firstCls = (hot.getCellMeta(first.row ?? 0, first.col ?? 0).className ?? "") as string;
    const adding = !firstCls.split(/\s+/).includes(token);

    for (const range of ranges) {
        const tl = range.getTopLeftCorner();
        const br = range.getBottomRightCorner();
        for (let r = tl.row ?? 0; r <= (br.row ?? -1); r++) {
            for (let c = tl.col ?? 0; c <= (br.col ?? -1); c++) {
                const cls = (hot.getCellMeta(r, c).className ?? "") as string;
                const has = cls.split(/\s+/).includes(token);
                if (has === adding) continue;
                hot.setCellMeta(r, c, "className", toggleClassToken(cls, token));
            }
        }
    }
    hot.render();
    notifyGridMutated();
}

/** Insert or remove a row at the current selection. */
function alterRow(action: "insert_row_above" | "insert_row_below" | "remove_row"): void {
    const hot = getActiveHot();
    const sel = hot?.getSelectedLast();
    if (!hot || !sel) return;
    hot.alter(action, sel[0]);
    notifyGridMutated();
}

/**
 * Insert a blank cell at the selection, shifting that column's cells (text and
 * decoration meta) below it down by one. Unlike a row insert, adjacent speech
 * columns keep their rows; the last row's value falls off the bottom.
 */
function insertCell(): void {
    const hot = getActiveHot();
    const sel = hot?.getSelectedLast();
    if (!hot || !sel) return;
    const [row, col] = sel;
    const last = hot.countRows() - 1;

    // Bottom-up so each read of (r-1) sees the pre-shift value/meta.
    const values: [number, number, string | null][] = [];
    for (let r = last; r > row; r--) {
        values.push([r, col, hot.getDataAtCell(r - 1, col) as string | null]);
        hot.setCellMeta(r, col, "className", (hot.getCellMeta(r - 1, col).className ?? "") as string);
    }
    hot.setCellMeta(row, col, "className", "");
    values.push([row, col, ""]);
    hot.setDataAtCell(values);
    hot.render();
    notifyGridMutated();
}

export function executeCommand(id: CommandId): void {
    const state = useFlowStore.getState();
    const { round } = state;

    switch (id) {
        // --- Grid ------------------------------------------------------------
        case "edit.undo":
            getActiveHot()?.getPlugin("undoRedo")?.undo();
            notifyGridMutated();
            return;
        case "edit.redo":
            getActiveHot()?.getPlugin("undoRedo")?.redo();
            notifyGridMutated();
            return;
        case "format.toggleBold":
            toggleDecoration(BOLD_CLASS);
            return;
        case "format.toggleHighlight":
            toggleDecoration(HIGHLIGHT_CLASS);
            return;
        case "row.insertAbove":
            alterRow("insert_row_above");
            return;
        case "row.insertBelow":
            alterRow("insert_row_below");
            return;
        case "row.delete":
            alterRow("remove_row");
            return;
        case "cell.insert":
            insertCell();
            return;

        // --- Sheets ----------------------------------------------------------
        case "sheet.next":
        case "sheet.prev": {
            if (!round) return;
            const sheets = sortedSheets(round).filter((s) => s.kind !== "cx");
            if (sheets.length === 0) return;
            const idx = sheets.findIndex((s) => s.id === state.activeSheetId);
            const base = idx === -1 ? 0 : idx;
            const next =
                id === "sheet.next" ? Math.min(base + 1, sheets.length - 1) : Math.max(base - 1, 0);
            state.setActiveSheet(sheets[next].id);
            return;
        }
        case "sheet.newAff": {
            if (!round) return;
            state.addSheet({ title: "Untitled", group: "aff" });
            return;
        }
        case "sheet.newNeg": {
            if (!round) return;
            state.addSheet({ title: "Untitled", group: "neg" });
            return;
        }
        case "sheet.rename": {
            const { activeSheetId } = state;
            if (!activeSheetId) return;
            state.setRenamingSheet(activeSheetId);
            return;
        }
        case "sheet.quickSwitch":
            state.setQuickSwitcherOpen(true);
            return;
        case "palette.open":
            // Same palette, seeded with ">" so it opens in command mode.
            state.setQuickSwitcherOpen(true, ">");
            return;
        case "sheet.jump1":
        case "sheet.jump2":
        case "sheet.jump3":
        case "sheet.jump4":
        case "sheet.jump5":
        case "sheet.jump6":
        case "sheet.jump7":
        case "sheet.jump8":
        case "sheet.jump9": {
            jumpToSheet(Number(id.slice("sheet.jump".length)));
            return;
        }

        // --- UI ---------------------------------------------------------------
        case "settings.open":
            state.setSettingsOpen(true);
            return;
        case "info.open":
            state.setInfoOpen(true);
            return;
        case "help.open":
            state.setCheatsheetOpen(!state.cheatsheetOpen);
            return;
        case "sidebar.toggle":
            state.setSidebarCollapsed(!state.sidebarCollapsed);
            return;
        case "theme.light":
            state.setTheme("light");
            return;
        case "theme.dark":
            state.setTheme("dark");
            return;
        case "theme.system":
            state.setTheme("system");
            return;
    }
}
