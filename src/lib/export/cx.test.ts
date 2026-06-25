import { describe, it, expect } from "vitest";
import { cxPeriods, CX_PERIODS } from "./cx";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";

function round(): Round {
    return {
        id: "r",
        createdAt: 0,
        updatedAt: 0,
        role: "aff",
        format: {
            id: "f",
            name: "P",
            prepSeconds: { aff: 0, neg: 0 },
            speeches: [],
        },
        scouting: emptyScouting(),
        sheets: [
            { id: "cx", title: "CX", group: "aff", order: -1, kind: "cx" },
        ],
        nodes: [
            {
                id: "q",
                sheetId: "cx",
                speechId: "cx-1ac-q",
                parentId: null,
                order: 0,
                text: "Q1",
                statuses: [],
                bold: false,
            },
            {
                id: "a",
                sheetId: "cx",
                speechId: "cx-1ac-r",
                parentId: "q",
                order: 0,
                text: "A1",
                statuses: [],
                bold: false,
            },
        ],
        groups: [],
    } as Round;
}

describe("cxPeriods", () => {
    it("pairs questions with their response children per period", () => {
        const periods = cxPeriods(round());
        expect(periods).toHaveLength(CX_PERIODS.length);
        const firstAc = periods[0];
        expect(firstAc.label).toBe("1AC CX");
        expect(firstAc.pairs).toEqual([{ question: "Q1", response: "A1" }]);
    });

    it("returns empty pairs when there is no cx sheet", () => {
        const r = { ...round(), sheets: [] } as Round;
        expect(cxPeriods(r).every((p) => p.pairs.length === 0)).toBe(true);
    });
});
