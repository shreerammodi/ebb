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
    s("b", { affTeam: "Mission SK", tournament: "Glenbrooks", judge: "Lee" }),
];

describe("filterFlows", () => {
    it("returns all with a blank query", () => {
        expect(filterFlows(summaries, "").map((m) => m.summary.id)).toEqual(["a", "b"]);
    });
    it("matches on tournament case-insensitively", () => {
        expect(filterFlows(summaries, "berkeley").map((m) => m.summary.id)).toEqual(["a"]);
    });
    it("matches on team code and judge", () => {
        expect(filterFlows(summaries, "mission").map((m) => m.summary.id)).toEqual(["b"]);
        expect(filterFlows(summaries, "lee").map((m) => m.summary.id)).toEqual(["b"]);
    });
    it("returns nothing on a miss", () => {
        expect(filterFlows(summaries, "kritik")).toEqual([]);
    });
});
