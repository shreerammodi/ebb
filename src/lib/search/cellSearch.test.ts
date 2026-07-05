import { describe, it, expect } from "vitest";

import { makeFlowRound, type FlowRound } from "@/lib/model/flow";

import { collectCells, searchCells } from "./cellSearch";

/** Round whose first flow sheet carries a couple of filled cells. */
function roundWithCells(): FlowRound {
    const round = makeFlowRound("aff");
    const sheet = round.sheets.find((s) => s.kind !== "cx")!;
    // col 0 = "1AC", col 1 = "1NC" per POLICY_COLUMNS.
    sheet.data = [
        ["perm do both", "topicality"],
        ["", "  spaced value  "],
    ];
    return round;
}

describe("collectCells", () => {
    it("skips empty and whitespace-only cells and trims text", () => {
        const cells = collectCells(roundWithCells());
        const texts = cells.map((c) => c.text);
        expect(texts).toContain("perm do both");
        expect(texts).toContain("spaced value");
        expect(texts).not.toContain("");
    });

    it("tags each cell with its sheet and column header", () => {
        const cells = collectCells(roundWithCells());
        const perm = cells.find((c) => c.text === "perm do both")!;
        expect(perm.colName).toBe("1AC");
        expect(perm.side).toBe("aff");
        expect(perm.row).toBe(0);
        expect(perm.col).toBe(0);
    });

    it("reads the card flag from sheet meta", () => {
        const round = roundWithCells();
        const sheet = round.sheets.find((s) => s.kind !== "cx")!;
        sheet.meta["0,0"] = { card: true };
        const cells = collectCells(round);
        expect(cells.find((c) => c.text === "perm do both")!.card).toBe(true);
        expect(cells.find((c) => c.text === "topicality")!.card).toBe(false);
    });
});

describe("searchCells", () => {
    it("returns filled cells for an empty query", () => {
        expect(searchCells(roundWithCells(), "").length).toBe(3);
    });

    it("fuzzy-ranks a subsequence match with highlight positions", () => {
        const [top] = searchCells(roundWithCells(), "perm");
        expect(top.text).toBe("perm do both");
        expect(top.positions).toEqual([0, 1, 2, 3]);
    });

    it("returns nothing when no cell matches", () => {
        expect(searchCells(roundWithCells(), "zzzzz")).toEqual([]);
    });
});
