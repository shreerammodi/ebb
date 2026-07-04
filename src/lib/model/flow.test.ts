import { describe, expect, it } from "vitest";

import {
    firstFlowSheetId,
    makeCxFlowSheet,
    makeFlowRound,
    makeFlowSheet,
    normalizeFlow,
    sortedSheets,
    type FlowRound,
} from "./flow";

describe("makeFlowRound", () => {
    it("creates a CX sheet plus one flow sheet named for the side", () => {
        const r = makeFlowRound("neg");
        expect(r.sheets).toHaveLength(2);
        const cx = r.sheets.find((s) => s.kind === "cx")!;
        const flow = r.sheets.find((s) => s.kind !== "cx")!;
        expect(cx.order).toBe(-1);
        expect(flow.title).toBe("Neg");
        expect(flow.group).toBe("neg");
        expect(flow.startSpeechId).toBe("1nc");
        expect(flow.data).toEqual([]);
        expect(flow.meta).toEqual({});
    });

    it("judge rounds get an aff-grouped first sheet", () => {
        const r = makeFlowRound("judge");
        const flow = r.sheets.find((s) => s.kind !== "cx")!;
        expect(flow.group).toBe("aff");
        expect(flow.startSpeechId).toBe("1ac");
    });
});

describe("normalizeFlow", () => {
    it("fills defaults and guarantees exactly one CX sheet", () => {
        const raw = {
            id: "r1",
            createdAt: 1,
            updatedAt: 2,
            role: "aff",
            scouting: undefined,
            sheets: [{ id: "s1", title: "Aff", group: "aff", order: 0 }],
        } as unknown as FlowRound;
        const r = normalizeFlow(raw);
        expect(r.scouting.aff.first).toEqual({ first: "", last: "" });
        expect(r.sheets.filter((s) => s.kind === "cx")).toHaveLength(1);
        const s1 = r.sheets.find((s) => s.id === "s1")!;
        expect(s1.kind).toBe("flow");
        expect(s1.data).toEqual([]);
        expect(s1.meta).toEqual({});
    });

    it("does not duplicate an existing CX sheet and does not mutate input", () => {
        const raw = makeFlowRound("aff");
        const before = JSON.parse(JSON.stringify(raw));
        const r = normalizeFlow(raw);
        expect(r.sheets.filter((s) => s.kind === "cx")).toHaveLength(1);
        expect(JSON.parse(JSON.stringify(raw))).toEqual(before);
    });
});

describe("sheet ordering", () => {
    it("sortedSheets sorts by order; firstFlowSheetId skips CX", () => {
        const r = makeFlowRound("aff");
        const extra = makeFlowSheet({ title: "DA", group: "neg", order: 5 });
        const round = { ...r, sheets: [extra, ...r.sheets] };
        expect(sortedSheets(round).map((s) => s.title)).toEqual(["CX", "Aff", "DA"]);
        expect(firstFlowSheetId(round)).toBe(r.sheets.find((s) => s.kind !== "cx")!.id);
        expect(firstFlowSheetId({ ...round, sheets: [makeCxFlowSheet()] })).not.toBeNull();
    });

    it("firstFlowSheetId is null for an empty sheet list", () => {
        const r = { ...makeFlowRound("aff"), sheets: [] };
        expect(firstFlowSheetId(r)).toBeNull();
    });
});
