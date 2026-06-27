import { describe, it, expect } from "vitest";

import { filterFlows } from "./filter";
import type { RoundSummary } from "./summary";

function s(id: string, over: Partial<RoundSummary> = {}): RoundSummary {
    return {
        id,
        createdAt: 0,
        updatedAt: 0,
        role: "aff",
        affTeam: "",
        negTeam: "",
        ...over,
    };
}

const summaries = [
    s("a", { affTeam: "Westwood GM", tournament: "Berkeley" }),
    s("b", { affTeam: "Mission SK", tournament: "Glenbrooks" }),
];
const index = new Map<string, string>([
    ["a", "westwood gm berkeley perm do both"],
    ["b", "mission sk glenbrooks cap kritik"],
]);

describe("filterFlows", () => {
    it("returns all with a blank query", () => {
        expect(filterFlows(summaries, index, "").map((m) => m.summary.id)).toEqual(["a", "b"]);
    });
    it("matches on scouting fields", () => {
        const out = filterFlows(summaries, index, "berkeley");
        expect(out.map((m) => m.summary.id)).toEqual(["a"]);
    });
    it("matches on flow content and provides a snippet", () => {
        const out = filterFlows(summaries, index, "kritik");
        expect(out.map((m) => m.summary.id)).toEqual(["b"]);
        expect(out[0].snippet?.some((seg) => seg.match)).toBe(true);
    });
});
