import { describe, expect, it } from "vitest";

import { rebaseActions, type StructuralChange, type UndoAction } from "@/lib/collab/undoRebase";

const change = (...rows: number[]): UndoAction => ({
    actionType: "change",
    changes: rows.map((r) => [r, 0, "old", "new"] as [number, number, unknown, unknown]),
});

const rowInsert = (at: number, amount: number): StructuralChange => ({
    kind: "insertRow",
    at,
    amount,
    scope: { kind: "row" },
});

const rowRemove = (at: number, amount: number): StructuralChange => ({
    kind: "removeRow",
    at,
    amount,
    scope: { kind: "row" },
});

describe("a remote row insert", () => {
    it("shifts a change at or below the insertion point", () => {
        const out = rebaseActions([change(3)], rowInsert(2, 1)) as UndoAction[];
        expect(out[0].changes![0][0]).toBe(4);
    });

    it("leaves a change above the insertion point alone", () => {
        const out = rebaseActions([change(1)], rowInsert(2, 1)) as UndoAction[];
        expect(out[0].changes![0][0]).toBe(1);
    });

    it("shifts by the amount inserted", () => {
        const out = rebaseActions([change(3)], rowInsert(0, 3)) as UndoAction[];
        expect(out[0].changes![0][0]).toBe(6);
    });

    it("shifts a row insert and a row remove by their index", () => {
        const out = rebaseActions(
            [
                { actionType: "insert_row", index: 5, amount: 1 },
                { actionType: "remove_row", index: 1 },
            ],
            rowInsert(2, 1),
        ) as UndoAction[];
        expect(out[0].index).toBe(6);
        expect(out[1].index).toBe(1);
    });

    it("never mutates the stack it was given", () => {
        const original = change(3);
        rebaseActions([original], rowInsert(0, 1));
        expect(original.changes![0][0]).toBe(3);
    });

    it("shifts only changes in the affected column", () => {
        const action: UndoAction = {
            actionType: "change",
            changes: [
                [3, 0, "a", "b"],
                [3, 1, "c", "d"],
            ],
        };
        const out = rebaseActions([action], {
            kind: "insertRow",
            at: 0,
            amount: 1,
            scope: { kind: "column", col: 1 },
        }) as UndoAction[];
        expect(out[0].changes!.map(([row]) => row)).toEqual([3, 4]);
    });
});

describe("a remote row remove", () => {
    it("shifts a change below the removed span up", () => {
        const out = rebaseActions([change(5)], rowRemove(1, 2)) as UndoAction[];
        expect(out[0].changes![0][0]).toBe(3);
    });

    it("marks an action that names a row that is gone", () => {
        // There is nothing correct to rebase it to, and guessing would undo
        // into a row the debater never touched.
        expect(rebaseActions([change(2)], rowRemove(1, 2))).toEqual([null]);
    });

    it("leaves a change above the removed span alone", () => {
        const out = rebaseActions([change(0)], rowRemove(3, 1)) as UndoAction[];
        expect(out[0].changes![0][0]).toBe(0);
    });
});

describe("an action shape this build does not recognize", () => {
    it("is marked rather than left with a stale index", () => {
        for (const actionType of ["row_move", "filter", "merge_cells", "col_sort"]) {
            expect(rebaseActions([{ actionType }], rowInsert(0, 1))).toEqual([null]);
        }
    });

    it("is marked on its own, and the good one beside it is still corrected", () => {
        const out = rebaseActions([change(1), { actionType: "row_move" }], rowInsert(0, 1));
        expect(out[1]).toBeNull();
        expect(out[0]!.changes![0][0]).toBe(2);
    });
});

describe("an empty stack", () => {
    it("stays empty rather than clearing, so nothing is reported as lost", () => {
        expect(rebaseActions([], rowInsert(0, 1))).toEqual([]);
        expect(rebaseActions([], rowRemove(0, 1))).toEqual([]);
    });
});
