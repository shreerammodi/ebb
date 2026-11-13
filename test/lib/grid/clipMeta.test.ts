import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyClip, clipMatches, holdClip, resetClip } from "@/lib/grid/clipMeta";
import { CARD_CLASS } from "@/lib/grid/codec";
import { gridCol } from "@/lib/grid/colSpace";
import type { CellSource } from "@/lib/model/flow";

registerAllModules();

const SRC: CellSource = { app: "cardmirror", token: "t", key: "k" };

describe("clipMeta", () => {
    let hot: Handsontable;

    beforeEach(() => {
        resetClip();
        const el = document.createElement("div");
        document.body.appendChild(el);
        hot = new Handsontable(el, {
            data: [
                ["Card", "plain", ""],
                ["", "", ""],
                ["", "", ""],
                ["", "", ""],
            ],
            licenseKey: "non-commercial-and-evaluation",
        });
        hot.setCellMeta(0, 0, "className", CARD_CLASS);
        hot.setCellMeta(0, 0, "source", SRC);
    });

    afterEach(() => hot.destroy());

    const cls = (r: number, c: number) => hot.getCellMeta(r, c).className;
    const at = (row: number, col: number, width: number, height: number) => ({
        row,
        col: gridCol(col),
        width,
        height,
    });
    const range = { startRow: 0, startCol: 0, endRow: 0, endCol: 1 };

    it("lays a copied card back down where its text is pasted", () => {
        holdClip(hot, [range], [["Card", "plain"]]);
        hot.setCellMeta(2, 1, "className", CARD_CLASS);
        expect(clipMatches([["Card", "plain"]])).toBe(true);

        expect(applyClip(hot, at(2, 0, 2, 1))).toEqual([
            [2, 0],
            [2, 1],
        ]);
        expect(cls(2, 0)).toBe(CARD_CLASS);
        expect(hot.getCellMeta(2, 0).source).toEqual(SRC);
        expect(cls(2, 1)).toBe("");
    });

    it("survives a cut clearing the source cells", () => {
        holdClip(hot, [range], [["Card", "plain"]]);
        hot.setCellMeta(0, 0, "className", "");
        applyClip(hot, at(3, 0, 2, 1));
        expect(cls(3, 0)).toBe(CARD_CLASS);
    });

    it("does not match text that came from elsewhere", () => {
        holdClip(hot, [range], [["Card", "plain"]]);
        expect(clipMatches([["Card", "other"]])).toBe(false);
        expect(clipMatches([["Card"]])).toBe(false);
    });

    it("treats null and empty cells as the same text", () => {
        holdClip(hot, [{ ...range, endCol: 2 }], [["Card", "plain", null]]);
        expect(clipMatches([["Card", "plain", ""]])).toBe(true);
    });

    it("repeats across a larger selection and skips read-only cells", () => {
        holdClip(hot, [{ ...range, endCol: 0 }], [["Card"]]);
        hot.setCellMeta(2, 0, "readOnly", true);
        applyClip(hot, at(1, 0, 1, 3));
        expect(cls(1, 0)).toBe(CARD_CLASS);
        expect(cls(2, 0)).toBeFalsy();
        expect(cls(3, 0)).toBe(CARD_CLASS);
    });

    it("holds nothing for a multi-range copy", () => {
        holdClip(hot, [range, range], [["Card", "plain"]]);
        expect(clipMatches([["Card", "plain"]])).toBe(false);
    });
});
