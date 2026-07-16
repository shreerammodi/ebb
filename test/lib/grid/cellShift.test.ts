import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { afterEach, describe, expect, it } from "vitest";

import {
    insertCell,
    moveBlock,
    shiftMetaDown,
    shiftSpan,
    type CellGrid,
} from "@/lib/grid/cellShift";

registerAllModules();

/**
 * A column-major grid of text plus a className map keyed "row,col". `col` picks
 * one column's text out as an array, which is how the rotation assertions read.
 */
function fakeGrid(
    data: (string | null)[][],
    classNames: Record<string, string> = {},
): CellGrid & {
    data: (string | null)[][];
    classNames: Record<string, string>;
    apply(changes: [number, number, string | null][]): void;
    col(c: number): (string | null)[];
} {
    const store = { ...classNames };
    return {
        data,
        classNames: store,
        countRows: () => data.length,
        countCols: () => data[0]?.length ?? 0,
        getDataAtCell: (r, c) => data[r][c],
        getCellMeta: (r, c) => ({ className: store[`${r},${c}`] }),
        setCellMeta: (r, c, _key, value) => {
            if (value) store[`${r},${c}`] = value;
            else delete store[`${r},${c}`];
        },
        apply(changes) {
            for (const [r, c, v] of changes) data[r][c] = v;
        },
        col(c) {
            return data.map((row) => row[c]);
        },
    };
}

/** An empty rows x cols grid, for the decoration-only cases. */
const blank = (rows: number, cols: number): (string | null)[][] =>
    Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));

describe("shiftSpan", () => {
    it("moves a span down, dropping what runs off the last row", () => {
        const g = fakeGrid([["a"], ["b"], ["c"], ["d"]], { "1,0": "bold" });

        g.apply(shiftSpan(g, 0, 1, 4, 1));

        // Row 1 is a source, never a target, so its stale value stays for the
        // caller to blank. "d" fell off.
        expect(g.col(0)).toEqual(["a", "b", "b", "c"]);
        expect(g.classNames).toEqual({ "1,0": "bold", "2,0": "bold" });
    });

    it("moves a span up, dropping what runs off row 0", () => {
        const g = fakeGrid([["a"], ["b"], ["c"], ["d"]]);

        g.apply(shiftSpan(g, 0, 1, 4, -1));

        expect(g.col(0)).toEqual(["b", "c", "d", "d"]);
    });

    it("moves decorations alone when metaOnly is set", () => {
        const g = fakeGrid([["a"], ["b"], ["c"]], { "0,0": "bold" });

        const changes = shiftSpan(g, 0, 0, 3, 1, { metaOnly: true });

        expect(changes).toEqual([]);
        expect(g.col(0)).toEqual(["a", "b", "c"]);
        expect(g.classNames).toEqual({ "0,0": "bold", "1,0": "bold" });
    });

    it("touches only its own column", () => {
        const g = fakeGrid([
            ["a", "x"],
            ["b", "y"],
        ]);

        g.apply(shiftSpan(g, 0, 0, 2, 1));

        expect(g.col(1)).toEqual(["x", "y"]);
    });
});

describe("insertCell", () => {
    it("blanks the target and pushes the column down, dropping the last row", () => {
        const g = fakeGrid([["a"], ["b"], ["c"]], { "0,0": "bold", "1,0": "hl" });

        g.apply(insertCell(g, 1, 0));

        expect(g.col(0)).toEqual(["a", "", "b"]);
        expect(g.classNames).toEqual({ "0,0": "bold", "2,0": "hl" });
    });
});

describe("moveBlock", () => {
    it("rotates the cells a downward block passes over, losing nothing", () => {
        const g = fakeGrid([["A"], ["B"], ["C"], ["D"], ["E"]], { "1,0": "bold" });

        g.apply(moveBlock(g, 0, 1, 1, 2));

        expect(g.col(0)).toEqual(["A", "C", "D", "B", "E"]);
        expect(g.classNames).toEqual({ "3,0": "bold" });
    });

    it("rotates the cells an upward block passes over, losing nothing", () => {
        const g = fakeGrid([["A"], ["B"], ["C"], ["D"], ["E"]], { "3,0": "bold" });

        g.apply(moveBlock(g, 0, 3, 1, -2));

        expect(g.col(0)).toEqual(["A", "D", "B", "C", "E"]);
        expect(g.classNames).toEqual({ "1,0": "bold" });
    });

    it("moves a multi-row block", () => {
        const g = fakeGrid([["A"], ["B"], ["C"], ["D"], ["E"]]);

        g.apply(moveBlock(g, 0, 0, 2, 2));

        expect(g.col(0)).toEqual(["C", "D", "A", "B", "E"]);
    });

    it("handles a travel distance longer than the block itself", () => {
        const g = fakeGrid([["A"], ["B"], ["C"], ["D"], ["E"]]);

        g.apply(moveBlock(g, 0, 0, 1, 3));

        expect(g.col(0)).toEqual(["B", "C", "D", "A", "E"]);
    });

    it("is a no-op at delta zero", () => {
        const g = fakeGrid([["A"], ["B"]]);

        expect(moveBlock(g, 0, 0, 1, 0)).toEqual([]);
        expect(g.col(0)).toEqual(["A", "B"]);
    });
});

describe("shiftMetaDown", () => {
    it("moves the displaced classes down and leaves the pasted block bare", () => {
        const hot = fakeGrid(blank(6, 3), { "1,0": "bold", "2,0": "hl" });

        shiftMetaDown(hot, { row: 1, col: 0, width: 1, height: 2 });

        expect(hot.classNames).toEqual({ "3,0": "bold", "4,0": "hl" });
    });

    it("leaves rows above the paste and columns beside it untouched", () => {
        const hot = fakeGrid(blank(6, 3), { "0,0": "bold", "1,1": "card", "1,2": "group" });

        shiftMetaDown(hot, { row: 1, col: 0, width: 2, height: 1 });

        expect(hot.classNames).toEqual({ "0,0": "bold", "2,1": "card", "1,2": "group" });
    });

    it("drops classes pushed past the last row, as their text is", () => {
        const hot = fakeGrid(blank(3, 1), { "2,0": "bold" });

        shiftMetaDown(hot, { row: 0, col: 0, width: 1, height: 2 });

        expect(hot.classNames).toEqual({});
    });

    it("clamps a paste wider than the grid", () => {
        const hot = fakeGrid(blank(3, 2), { "0,1": "bold" });

        shiftMetaDown(hot, { row: 0, col: 0, width: 5, height: 1 });

        expect(hot.classNames).toEqual({ "1,1": "bold" });
    });
});

/**
 * The feature rests on Handsontable's `shift_down` paste mode moving text the
 * way `shiftMetaDown` assumes it does, so drive a real grid through the call
 * `CopyPaste.paste()` makes rather than a stand-in.
 */
describe("shift_down paste on a live grid", () => {
    let hot: Handsontable | null = null;
    afterEach(() => {
        hot?.destroy();
        hot = null;
    });

    function makeHot(data: string[][]) {
        const el = document.createElement("div");
        document.body.appendChild(el);
        hot = new Handsontable(el, { data, licenseKey: "non-commercial-and-evaluation" });
        return hot;
    }

    /** The call CopyPaste.paste() makes once pasteMode is "shift_down". */
    function paste(h: Handsontable, row: number, col: number, block: string[][]) {
        h.populateFromArray(row, col, block, undefined, undefined, "CopyPaste.paste", "shift_down");
    }

    it("pushes only the pasted columns down, growing the grid to hold them", () => {
        const h = makeHot([
            ["a1", "b1"],
            ["a2", "b2"],
            ["a3", "b3"],
        ]);

        paste(h, 0, 0, [["X"]]);

        expect(h.getData()).toEqual([
            ["X", "b1"],
            ["a1", "b2"],
            ["a2", "b3"],
            ["a3", null],
        ]);
    });

    it("carries a displaced cell's decoration along with its text", () => {
        const h = makeHot([
            ["tag", "b1"],
            ["a2", "b2"],
        ]);
        h.setCellMeta(0, 0, "className", "cell-bold");
        h.setCellMeta(0, 1, "className", "cell-card");

        paste(h, 0, 0, [["X"], ["Y"]]);
        shiftMetaDown(h, { row: 0, col: 0, width: 1, height: 2 });

        expect(h.getDataAtCell(2, 0)).toBe("tag");
        expect(h.getCellMeta(2, 0).className).toBe("cell-bold");
        expect(h.getCellMeta(0, 0).className).toBe("");
        // The neighboring speech keeps both its row and its decoration.
        expect(h.getCellMeta(0, 1).className).toBe("cell-card");
    });
});
