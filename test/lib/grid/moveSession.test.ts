import { afterEach, describe, expect, it } from "vitest";

import {
    beginMove,
    cellIsMoving,
    commitMove,
    isMovingIn,
    movingBlock,
    nudge,
    revertMove,
    type MoveGrid,
} from "@/lib/grid/moveSession";

/** A column-major grid over a plain array, with the setDataAtCell moveSession needs. */
function fakeGrid(
    data: (string | null)[][],
    classNames: Record<string, string> = {},
): MoveGrid & {
    data: (string | null)[][];
    classNames: Record<string, string>;
    col(c: number): (string | null)[];
} {
    const store = { ...classNames };
    return {
        data,
        classNames: store,
        countRows: () => data.length,
        countCols: () => data[0]?.length ?? 0,
        getDataAtCell: (r, c) => data[r][c],
        setDataAtCell: (changes) => {
            for (const [r, c, v] of changes) data[r][c] = v;
        },
        getCellMeta: (r, c) => ({ className: store[`${r},${c}`] }),
        setCellMeta: (r, c, _key, value) => {
            if (value) store[`${r},${c}`] = value;
            else delete store[`${r},${c}`];
        },
        col(c) {
            return data.map((row) => row[c]);
        },
    };
}

const oneCol = () => fakeGrid([["A"], ["B"], ["C"], ["D"], ["E"]]);

afterEach(() => {
    revertMove();
});

describe("beginMove", () => {
    it("opens a session over the selection's bounding rectangle", () => {
        const g = fakeGrid([
            ["a", "x"],
            ["b", "y"],
        ]);

        beginMove(g, { startRow: 0, endRow: 1, startCol: 0, endCol: 1 });

        expect(isMovingIn(g)).toBe(true);
        expect(movingBlock()).toEqual({ cols: [0, 1], blockStart: 0, height: 2 });
    });

    it("reports no session for a different grid", () => {
        const g = oneCol();
        beginMove(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 });

        expect(isMovingIn(oneCol())).toBe(false);
        expect(isMovingIn(null)).toBe(false);
    });
});

describe("nudge", () => {
    it("rotates the passed-over cells around the block", () => {
        const g = oneCol();
        beginMove(g, { startRow: 1, endRow: 1, startCol: 0, endCol: 0 });

        nudge(2);

        expect(g.col(0)).toEqual(["A", "C", "D", "B", "E"]);
        expect(movingBlock()!.blockStart).toBe(3);
    });

    it("rotates each selected column independently and leaves the rest alone", () => {
        const g = fakeGrid([
            ["Inherency", "T-shell", "perm"],
            ["Solvency", "CP text", "no link"],
            ["Harms", "DA link", "turn"],
            [null, "DA impact", null],
        ]);
        beginMove(g, { startRow: 0, endRow: 1, startCol: 0, endCol: 1 });

        nudge(1);

        expect(g.col(0)).toEqual(["Harms", "Inherency", "Solvency", null]);
        expect(g.col(1)).toEqual(["DA link", "T-shell", "CP text", "DA impact"]);
        expect(g.col(2)).toEqual(["perm", "no link", "turn", null]);
    });

    it("clamps at row 0 and at the last row", () => {
        const g = oneCol();
        beginMove(g, { startRow: 1, endRow: 2, startCol: 0, endCol: 0 });

        nudge(-9);
        expect(movingBlock()!.blockStart).toBe(0);
        expect(g.col(0)).toEqual(["B", "C", "A", "D", "E"]);

        nudge(99);
        expect(movingBlock()!.blockStart).toBe(3);
        expect(g.col(0)).toEqual(["A", "D", "E", "B", "C"]);
    });

    it("carries decorations with the block", () => {
        const g = fakeGrid([["A"], ["B"], ["C"]], { "0,0": "flow-bold" });
        beginMove(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 });

        nudge(2);

        expect(g.classNames).toEqual({ "2,0": "flow-bold" });
    });

    it("does nothing without a session", () => {
        const g = oneCol();
        nudge(1);
        expect(g.col(0)).toEqual(["A", "B", "C", "D", "E"]);
    });
});

describe("cellIsMoving", () => {
    it("covers the block's rows in every selected column", () => {
        const g = fakeGrid([
            ["a", "x", "p"],
            ["b", "y", "q"],
        ]);
        beginMove(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 1 });

        expect(cellIsMoving(g, 0, 0)).toBe(true);
        expect(cellIsMoving(g, 0, 1)).toBe(true);
        expect(cellIsMoving(g, 0, 2)).toBe(false);
        expect(cellIsMoving(g, 1, 0)).toBe(false);
    });
});

describe("revertMove", () => {
    it("restores the entry state, data and decorations alike", () => {
        const g = fakeGrid([["A"], ["B"], ["C"]], { "0,0": "flow-bold", "2,0": "flow-card" });
        beginMove(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 });

        nudge(2);
        revertMove();

        expect(g.col(0)).toEqual(["A", "B", "C"]);
        expect(g.classNames).toEqual({ "0,0": "flow-bold", "2,0": "flow-card" });
        expect(isMovingIn(g)).toBe(false);
    });
});

describe("commitMove", () => {
    it("lands the same grid the accumulated nudges produced", () => {
        const g = oneCol();
        beginMove(g, { startRow: 1, endRow: 1, startCol: 0, endCol: 0 });
        nudge(1);
        nudge(1);
        const nudged = g.col(0);

        commitMove();

        expect(g.col(0)).toEqual(nudged);
        expect(g.col(0)).toEqual(["A", "C", "D", "B", "E"]);
        expect(isMovingIn(g)).toBe(false);
    });

    it("restores the entry state when the block never left it", () => {
        const g = oneCol();
        beginMove(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 });
        nudge(2);
        nudge(-2);

        commitMove();

        expect(g.col(0)).toEqual(["A", "B", "C", "D", "E"]);
    });
});
