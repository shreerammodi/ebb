import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { afterEach, describe, expect, it } from "vitest";

import { shiftMetaDown, type MetaGrid } from "./insertPaste";

registerAllModules();

/** A grid of classNames keyed "row,col"; unlisted cells are bare. */
function fakeGrid(
    rows: number,
    cols: number,
    classNames: Record<string, string>,
): MetaGrid & {
    classNames: Record<string, string>;
} {
    const store = { ...classNames };
    return {
        classNames: store,
        countRows: () => rows,
        countCols: () => cols,
        getCellMeta: (r, c) => ({ className: store[`${r},${c}`] }),
        setCellMeta: (r, c, _key, value) => {
            if (value) store[`${r},${c}`] = value;
            else delete store[`${r},${c}`];
        },
    };
}

describe("shiftMetaDown", () => {
    it("moves the displaced classes down and leaves the pasted block bare", () => {
        const hot = fakeGrid(6, 3, { "1,0": "bold", "2,0": "hl" });

        shiftMetaDown(hot, { row: 1, col: 0, width: 1, height: 2 });

        expect(hot.classNames).toEqual({ "3,0": "bold", "4,0": "hl" });
    });

    it("leaves rows above the paste and columns beside it untouched", () => {
        const hot = fakeGrid(6, 3, { "0,0": "bold", "1,1": "card", "1,2": "group" });

        shiftMetaDown(hot, { row: 1, col: 0, width: 2, height: 1 });

        expect(hot.classNames).toEqual({ "0,0": "bold", "2,1": "card", "1,2": "group" });
    });

    it("drops classes pushed past the last row, as their text is", () => {
        const hot = fakeGrid(3, 1, { "2,0": "bold" });

        shiftMetaDown(hot, { row: 0, col: 0, width: 1, height: 2 });

        expect(hot.classNames).toEqual({});
    });

    it("clamps a paste wider than the grid", () => {
        const hot = fakeGrid(3, 2, { "0,1": "bold" });

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
