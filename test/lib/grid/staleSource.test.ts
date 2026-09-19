import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    onRedoStackChange,
    onUndoStackChange,
    resetMetaUndo,
    restoreMetaRedo,
    restoreMetaUndo,
} from "@/lib/grid/metaUndo";
import { breakEmptiedLinks, STRUCTURED_WRITE, type GridChange } from "@/lib/grid/staleSource";
import type { CellSource } from "@/lib/model/flow";

registerAllModules();

const SRC: CellSource = {
    app: "cardmirror",
    token: "cmsrc1abc",
    key: "doc1|perm solves",
    title: "AT - Cap K",
};

/**
 * The module runs against the live grid from inside `afterChange`, so the suite
 * wires a miniature HotGrid with the same undo hooks and empty-cell filters.
 */
describe("breakEmptiedLinks", () => {
    let hot: Handsontable;

    beforeEach(() => {
        resetMetaUndo();
        const el = document.createElement("div");
        document.body.appendChild(el);
        hot = new Handsontable(el, {
            data: [
                ["Perm solves", "b"],
                ["c", "d"],
            ],
            undo: true,
            licenseKey: "non-commercial-and-evaluation",
            afterChange: (changes, source) => {
                if (changes && (source === "edit" || source === "CopyPaste.cut")) {
                    breakEmptiedLinks(hot, changes as GridChange[], source === "CopyPaste.cut");
                }
            },
            afterUndoStackChange: onUndoStackChange,
            afterRedoStackChange: onRedoStackChange,
            afterUndo: () => restoreMetaUndo(hot),
            afterRedo: () => restoreMetaRedo(hot),
        });
        hot.setCellMeta(0, 0, "className", "flow-card");
        hot.setCellMeta(0, 0, "source", SRC);
    });

    afterEach(() => {
        hot.destroy();
    });

    const sourceAt = (row: number, col: number) => hot.getCellMeta(row, col).source;

    it("drops the provenance of a cell the user emptied, and keeps its decoration", () => {
        hot.selectCell(0, 0);
        hot.emptySelectedCells();

        expect(sourceAt(0, 0)).toBeUndefined();
        expect(hot.getCellMeta(0, 0).className).toBe("flow-card");
    });

    it("brings the link back when the user undoes the delete", () => {
        hot.selectCell(0, 0);
        hot.emptySelectedCells();
        (hot.getPlugin("undoRedo") as unknown as { undo(): void }).undo();

        expect(hot.getDataAtCell(0, 0)).toBe("Perm solves");
        expect(sourceAt(0, 0)).toEqual(SRC);
    });

    it("removes decoration and provenance from a cut cell, with undo and redo", () => {
        hot.selectCell(0, 0);
        hot.emptySelectedCells("CopyPaste.cut");

        expect(hot.getCellMeta(0, 0).className).toBe("");
        expect(sourceAt(0, 0)).toBeUndefined();

        const undo = hot.getPlugin("undoRedo") as unknown as { undo(): void; redo(): void };
        undo.undo();
        expect(hot.getDataAtCell(0, 0)).toBe("Perm solves");
        expect(hot.getCellMeta(0, 0).className).toBe("flow-card");
        expect(sourceAt(0, 0)).toEqual(SRC);

        undo.redo();
        expect(hot.getDataAtCell(0, 0)).toBeNull();
        expect(hot.getCellMeta(0, 0).className).toBe("");
        expect(sourceAt(0, 0)).toBeUndefined();
    });

    it("keeps the link when the user edits the text instead of emptying it", () => {
        hot.setDataAtCell(0, 0, "Perm solves the link turn");

        expect(sourceAt(0, 0)).toEqual(SRC);
    });

    it("leaves a structured write alone, so it keeps the undo action it claims", () => {
        // The pane filters this out by change source; asserting it here pins the
        // name the four structured writes pass.
        hot.setDataAtCell([[0, 0, ""]], STRUCTURED_WRITE);

        expect(sourceAt(0, 0)).toEqual(SRC);
    });

    it("ignores a cell that carries no provenance", () => {
        expect(breakEmptiedLinks(hot, [[1, 0, "c", ""]])).toEqual([]);
    });
});
