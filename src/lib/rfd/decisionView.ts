/**
 * What the decision view lays out beside the RFD: the cross-ex sheet whole,
 * and from every flow sheet only the last speech each side gives - the 2NR
 * and the 2AR in Policy - because those are the speeches a decision is
 * written on.
 */

import { getEvent } from "@/lib/format/events";
import { columnsForFlowSheet, type SpeechCol } from "@/lib/grid/flowColumns";
import { sortedSheets, type FlowRound, type FlowSheet } from "@/lib/model/flow";

/** One column a panel shows, with its index in the sheet's stored grid. */
export interface DecisionColumn {
    col: SpeechCol;
    index: number;
}

/** One grid row under a panel's columns; `cells` runs parallel to the columns. */
export interface DecisionRow {
    row: number;
    cells: string[];
}

export interface DecisionPanel {
    sheet: FlowSheet;
    columns: DecisionColumn[];
    rows: DecisionRow[];
}

/**
 * Ids of the last speech each side gives in the round's event: Policy's and
 * LD's 2NR and 2AR, Public Forum's two final focuses, Parliamentary's
 * Opposition Block and PMR.
 */
export function lastRebuttalIds(round: FlowRound): Set<string> {
    const event = getEvent(round.event);
    const ids = new Set<string>();
    for (const side of [event.aff, event.neg]) {
        const last = side.at(-1);
        if (last) ids.add(last.id);
    }
    return ids;
}

/**
 * The columns a sheet's panel shows, in speaking order. A flow sheet shows
 * only its last rebuttals. The cross-ex sheet shows each period that holds
 * any text, as its whole pair, so four periods of mostly empty columns do not
 * push every flow sheet off screen; with nothing written yet it shows them
 * all.
 */
export function decisionColumns(round: FlowRound, sheet: FlowSheet): DecisionColumn[] {
    const columns = columnsForFlowSheet(round, sheet).map((col, index) => ({ col, index }));
    if (sheet.kind === "cx") {
        const used = new Set<string | undefined>();
        for (const { col, index } of columns) {
            if (sheet.data.some((row) => (row[index] ?? "").trim() !== "")) used.add(col.group);
        }
        return used.size === 0 ? columns : columns.filter(({ col }) => used.has(col.group));
    }
    const last = lastRebuttalIds(round);
    return columns.filter(({ col }) => last.has(col.id));
}

/**
 * The grid rows under `columns`, skipping every row that is blank across all
 * of them: a long gap above a late 2NR closes up, while a 2AR answer written
 * beside the 2NR line it answers stays on that line.
 */
export function decisionRows(sheet: FlowSheet, columns: DecisionColumn[]): DecisionRow[] {
    const rows: DecisionRow[] = [];
    sheet.data.forEach((data, row) => {
        const cells = columns.map(({ index }) => data[index] ?? "");
        if (cells.some((text) => text.trim() !== "")) rows.push({ row, cells });
    });
    return rows;
}

/**
 * Every sheet the view can lay out, in sheet order, split by whether it is
 * on screen. A sheet shows when its columns hold any text; `overrides` is
 * what the debater showed or hid by hand, and it wins over that default.
 */
export function decisionPanels(
    round: FlowRound,
    overrides: Readonly<Record<string, boolean>>,
): { shown: DecisionPanel[]; hidden: DecisionPanel[] } {
    const shown: DecisionPanel[] = [];
    const hidden: DecisionPanel[] = [];
    for (const sheet of sortedSheets(round)) {
        const columns = decisionColumns(round, sheet);
        if (columns.length === 0) continue;
        const rows = decisionRows(sheet, columns);
        const visible = overrides[sheet.id] ?? rows.length > 0;
        (visible ? shown : hidden).push({ sheet, columns, rows });
    }
    return { shown, hidden };
}
