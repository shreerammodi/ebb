import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertCell } from "./cellShift";
import {
    attachMetaUndo,
    onRedoStackChange,
    onUndoStackChange,
    resetMetaUndo,
    restoreMetaRedo,
    restoreMetaUndo,
    snapshotClasses,
} from "./metaUndo";

registerAllModules();

/**
 * Handsontable's undo stack records setDataAtCell and ignores setCellMeta, so
 * the module rides the documented undo hooks on a real grid rather than a stub.
 */
describe("metaUndo on a live grid", () => {
    let hot: Handsontable | null = null;

    beforeEach(() => {
        resetMetaUndo();
    });
    afterEach(() => {
        hot?.destroy();
        hot = null;
        resetMetaUndo();
    });

    function makeHot() {
        const el = document.createElement("div");
        document.body.appendChild(el);
        hot = new Handsontable(el, {
            data: [["a"], ["b"], ["c"]],
            undo: true,
            licenseKey: "non-commercial-and-evaluation",
            afterUndoStackChange: onUndoStackChange,
            afterRedoStackChange: onRedoStackChange,
            afterUndo: () => restoreMetaUndo(hot!),
            afterRedo: () => restoreMetaRedo(hot!),
        });
        return hot;
    }

    /** What commands.runInsertCell does, minus the store plumbing. */
    function doInsert(h: Handsontable, row: number, col: number) {
        const before = snapshotClasses(h, [col]);
        h.setDataAtCell(insertCell(h, row, col));
        attachMetaUndo({ cols: [col], before, after: snapshotClasses(h, [col]) });
    }

    it("returns a decoration to its cell when the insert that moved it is undone", () => {
        const h = makeHot();
        h.setCellMeta(1, 0, "className", "flow-bold");

        doInsert(h, 1, 0);
        expect(h.getDataAtCell(2, 0)).toBe("b");
        expect(h.getCellMeta(2, 0).className).toBe("flow-bold");

        h.getPlugin("undoRedo").undo();

        expect(h.getDataAtCell(1, 0)).toBe("b");
        expect(h.getCellMeta(1, 0).className).toBe("flow-bold");
        expect(h.getCellMeta(2, 0).className).toBe("");
    });

    it("re-applies the decoration on redo", () => {
        const h = makeHot();
        h.setCellMeta(1, 0, "className", "flow-bold");

        doInsert(h, 1, 0);
        h.getPlugin("undoRedo").undo();
        h.getPlugin("undoRedo").redo();

        expect(h.getDataAtCell(2, 0)).toBe("b");
        expect(h.getCellMeta(2, 0).className).toBe("flow-bold");
        expect(h.getCellMeta(1, 0).className).toBe("");
    });

    it("leaves an unattached action alone", () => {
        const h = makeHot();
        h.setCellMeta(0, 0, "className", "flow-bold");

        h.setDataAtCell(0, 0, "z");
        h.getPlugin("undoRedo").undo();

        expect(h.getDataAtCell(0, 0)).toBe("a");
        expect(h.getCellMeta(0, 0).className).toBe("flow-bold");
    });
});

describe("snapshotClasses", () => {
    it("records only the decorated cells of the named columns", () => {
        const grid = {
            countRows: () => 3,
            countCols: () => 2,
            getDataAtCell: () => null,
            getCellMeta: (r: number, c: number) =>
                r === 1 && c === 0 ? { className: "flow-bold" } : { className: "" },
            setCellMeta: () => {},
        };

        expect(snapshotClasses(grid, [0, 1])).toEqual([[1, 0, "flow-bold"]]);
    });
});
