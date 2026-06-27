import { describe, it, expect } from "vitest";
import { buildSummary } from "./summary";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function baseRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "r1",
    createdAt: 10,
    updatedAt: 20,
    role: "aff",
    format: {
      id: "f",
      name: "Policy",
      speeches: [],
      prepSeconds: { aff: 240, neg: 240 },
    },
    scouting: emptyScouting(),
    sheets: [],
    nodes: [],
    groups: [],
    ...overrides,
  };
}

describe("buildSummary", () => {
  it("derives team codes from scouting schools + debaters", () => {
    const r = baseRound({
      scouting: {
        ...emptyScouting(),
        affSchool: "Westwood",
        negSchool: "Harvard",
        aff: {
          first: { first: "A", last: "Gold" },
          second: { first: "B", last: "Mehta" },
        },
        neg: {
          first: { first: "C", last: "Smith" },
          second: { first: "D", last: "Brown" },
        },
        tournament: "Berkeley",
        round: "Round 3",
        judge: "K. Strange",
      },
    });
    const s = buildSummary(r);
    expect(s.affTeam).toBe("Westwood GM");
    expect(s.negTeam).toBe("Harvard BS");
    expect(s.tournament).toBe("Berkeley");
    expect(s.round).toBe("Round 3");
    expect(s.judge).toBe("K. Strange");
    expect(s.id).toBe("r1");
    expect(s.role).toBe("aff");
    expect(s.updatedAt).toBe(20);
  });

  it("returns empty team strings when scouting is blank", () => {
    const s = buildSummary(baseRound());
    expect(s.affTeam).toBe("");
    expect(s.negTeam).toBe("");
    expect(s.tournament).toBeUndefined();
  });

  it("passes through the decision", () => {
    const r = baseRound({
      scouting: {
        ...emptyScouting(),
        decision: { vote: "neg", rfd: "clear neg" },
      },
    });
    expect(buildSummary(r).decision).toEqual({
      vote: "neg",
      rfd: "clear neg",
    });
  });
});
