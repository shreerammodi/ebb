import { describe, it, expect } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";

import { cxPeriods, CX_PERIODS } from "./cx";

function round() {
    const r = makeFlowRound("aff");
    const cx = r.sheets.find((s) => s.kind === "cx")!;
    cx.data = [
        ["Q1", "A1", null, null, null, null, null, null],
        ["Q2", null, null, null, null, null, null, null],
    ];
    return r;
}

describe("cxPeriods", () => {
    it("pairs questions with responses by column pair per period", () => {
        const periods = cxPeriods(round());
        expect(periods).toHaveLength(CX_PERIODS.length);
        expect(periods[0].label).toBe("1AC CX");
        expect(periods[0].pairs).toEqual([
            { question: "Q1", response: "A1" },
            { question: "Q2", response: "" },
        ]);
        expect(periods[1].pairs).toEqual([]);
    });

    it("returns empty pairs when there is no cx sheet", () => {
        const r = { ...round(), sheets: [] };
        expect(cxPeriods(r).every((p) => p.pairs.length === 0)).toBe(true);
    });

    it("skips rows that are empty in a period while keeping later rows", () => {
        const r = round();
        const cx = r.sheets.find((s) => s.kind === "cx")!;
        cx.data = [
            [null, null, "nq1", "nr1", null, null, null, null],
            ["Q1", null, null, null, null, null, null, null],
        ];
        const periods = cxPeriods(r);
        expect(periods[0].pairs).toEqual([{ question: "Q1", response: "" }]);
        expect(periods[1].pairs).toEqual([{ question: "nq1", response: "nr1" }]);
    });
});
