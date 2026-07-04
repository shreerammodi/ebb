import { describe, it, expect } from "vitest";

import { makeCxFlowSheet, makeFlowRound } from "@/lib/model/flow";

import { buildExportSheets } from "./cells";

function round() {
    const r = makeFlowRound("aff");
    const flow = r.sheets.find((s) => s.kind !== "cx")!;
    flow.title = "T";
    flow.data = [
        ["arg one", null],
        [null, "answer"],
        ["", null],
    ];
    flow.meta = { "0,0": { bold: true } };
    return r;
}

describe("buildExportSheets", () => {
    it("places non-empty cells with column names and decorations", () => {
        const sheets = buildExportSheets(round());
        const es = sheets.find((s) => s.sheet.title === "T")!;
        expect(es.cells).toHaveLength(2);
        const first = es.cells.find((c) => c.row === 0)!;
        expect(first).toMatchObject({
            col: 0,
            speechName: "1AC",
            text: "arg one",
            bold: true,
            crossed: false,
            extended: false,
        });
        const second = es.cells.find((c) => c.row === 1)!;
        expect(second).toMatchObject({ col: 1, speechName: "1NC", bold: false });
        expect(es.rowCount).toBe(2);
    });

    it("includes the CX sheet with CX columns and sorts sheets by order", () => {
        const sheets = buildExportSheets(round());
        expect(sheets[0].sheet.kind).toBe("cx");
        expect(sheets[0].columns[0].id).toBe("cx-1ac-q");
    });

    it("ignores cells beyond the visible column count", () => {
        const r = makeFlowRound("aff");
        const cx = r.sheets.find((s) => s.kind === "cx")!;
        r.sheets = [{ ...makeCxFlowSheet(), id: cx.id }];
        r.sheets[0].data = [Array.from({ length: 10 }, (_, i) => (i === 9 ? "spill" : null))];
        const [es] = buildExportSheets(r);
        expect(es.cells).toHaveLength(0);
    });
});
