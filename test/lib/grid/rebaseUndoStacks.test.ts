import { describe, expect, it } from "vitest";

import type { UndoAction } from "@/lib/collab/undoRebase";
import {
    attachMetaUndo,
    onUndoStackChange,
    rebaseUndoStacks,
    restoreMetaRedo,
    runMetaUndoBeforeUndo,
} from "@/lib/grid/metaUndo";

/** Stands in for Handsontable's undo plugin: two arrays of live actions. */
function plugin(done: UndoAction[], undone: UndoAction[] = []) {
    return { doneActions: done, undoneActions: undone };
}

function changeAt(row: number, col = 0): UndoAction {
    return { actionType: "change", changes: [[row, col, "old", "new"]] };
}

/** Pairs a decoration snapshot with the action just pushed, as writers do. */
function withMeta(action: UndoAction, row: number, col = 0) {
    onUndoStackChange([], [action]);
    attachMetaUndo({
        cols: [col],
        before: [[row, col, ""]],
        after: [[row, col, "ebb-bold"]],
    });
    return action;
}

describe("rebaseUndoStacks", () => {
    it("shifts the text stack in place, keeping each action's identity", () => {
        const action = changeAt(3);
        const p = plugin([action]);
        rebaseUndoStacks(p, { kind: "insertRow", at: 0, amount: 1 });
        // Identity matters: the decoration snapshots are keyed on these objects.
        expect(p.doneActions[0]).toBe(action);
        expect(action.changes![0][0]).toBe(4);
    });

    it("shifts the redo stack too, so a redo does not land a row off", () => {
        const undone = changeAt(2);
        const p = plugin([], [undone]);
        rebaseUndoStacks(p, { kind: "insertRow", at: 0, amount: 1 });
        expect(undone.changes![0][0]).toBe(3);
    });

    it("keeps decorations aligned with the text they belong to", () => {
        const action = withMeta(changeAt(3), 3);
        const p = plugin([action]);
        rebaseUndoStacks(p, { kind: "insertRow", at: 0, amount: 2 });
        expect(action.changes![0][0]).toBe(5);

        // Restore through the real path and see which row it writes. A
        // snapshot left at row 3 would undo a bold onto a row whose text has
        // moved to row 5.
        const written: [number, number, unknown][] = [];
        const grid = {
            countRows: () => 10,
            countCols: () => 2,
            getDataAtCell: () => null,
            getCellMeta: () => ({}),
            setCellMeta: (r: number, c: number, key: string, v: unknown) => {
                if (key === "className") written.push([r, c, v]);
            },
        };
        onUndoStackChange([], [action]);
        expect(restoreMetaRedo(grid)).toBe(true);
        // applyClasses blanks the column first, so the decorated row is the
        // only one it writes a class to.
        expect(written.filter(([, , v]) => v !== "").map(([r]) => r)).toEqual([5]);
    });

    it("shifts a structural effect with its native action", () => {
        const action = changeAt(3);
        const rows: number[] = [];
        onUndoStackChange([], [action]);
        attachMetaUndo({
            cols: [0],
            before: [],
            after: [],
            effects: {
                row: 3,
                beforeUndo: (row) => rows.push(row),
            },
        });
        const p = plugin([action]);

        rebaseUndoStacks(p, { kind: "insertRow", at: 0, amount: 2 });
        onUndoStackChange([action], []);
        runMetaUndoBeforeUndo();

        expect(rows).toEqual([5]);
    });

    it("drops history when a remove takes away a structural effect row", () => {
        const action = changeAt(5);
        onUndoStackChange([], [action]);
        attachMetaUndo({
            cols: [0],
            before: [],
            after: [],
            effects: { row: 2 },
        });
        const p = plugin([action]);

        rebaseUndoStacks(p, { kind: "removeRow", at: 2, amount: 1 });

        expect(p.doneActions).toEqual([]);
    });

    it("drops both stacks when a shape it cannot correct is present", () => {
        const p = plugin([changeAt(1), { actionType: "row_move" }], [changeAt(0)]);
        rebaseUndoStacks(p, { kind: "insertRow", at: 0, amount: 1 });
        expect(p.doneActions).toEqual([]);
    });

    it("drops the stack when an action names a row the remove took away", () => {
        const p = plugin([changeAt(2)]);
        rebaseUndoStacks(p, { kind: "removeRow", at: 2, amount: 1 });
        expect(p.doneActions).toEqual([]);
    });

    it("leaves an empty stack alone", () => {
        const p = plugin([]);
        rebaseUndoStacks(p, { kind: "insertRow", at: 0, amount: 1 });
        expect(p.doneActions).toEqual([]);
    });

    it("does nothing at all with no undo plugin, rather than throwing", () => {
        expect(() =>
            rebaseUndoStacks(undefined, { kind: "insertRow", at: 0, amount: 1 }),
        ).not.toThrow();
    });
});
