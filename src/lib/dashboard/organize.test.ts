import { describe, it, expect } from "vitest";
import { sortSummaries, groupByTournament, type SortKey } from "./organize";
import type { RoundSummary } from "./summary";

function s(over: Partial<RoundSummary>): RoundSummary {
  return { id: "x", createdAt: 0, updatedAt: 0, role: "aff", affTeam: "", negTeam: "", ...over };
}

describe("sortSummaries", () => {
  const list = [
    s({ id: "a", updatedAt: 3, tournament: "Berkeley", date: "2026-01-02" }),
    s({ id: "b", updatedAt: 9, tournament: "Apple", date: "2026-03-01" }),
  ];
  it("sorts by last edited desc", () => {
    expect(sortSummaries(list, "updated").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("sorts by tournament asc", () => {
    expect(sortSummaries(list, "tournament").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("sorts by date desc", () => {
    expect(sortSummaries(list, "date").map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("groupByTournament", () => {
  it("groups and puts untitled last", () => {
    const groups = groupByTournament([
      s({ id: "a", tournament: "Berkeley" }),
      s({ id: "b" }),
      s({ id: "c", tournament: "Berkeley" }),
    ]);
    expect(groups[0].label).toBe("Berkeley");
    expect(groups[0].items.map((x) => x.id)).toEqual(["a", "c"]);
    expect(groups[groups.length - 1].label).toBe("No tournament");
  });
});
