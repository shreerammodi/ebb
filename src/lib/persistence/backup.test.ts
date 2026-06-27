import { describe, it, expect } from "vitest";
import { exportBackupJSON, parseImportFile } from "./backup";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: {
      id: "f",
      name: "T",
      speeches: [],
      prepSeconds: { aff: 240, neg: 240 },
    },
    scouting: emptyScouting(),
    sheets: [],
    nodes: [],
    groups: [],
  };
}

describe("backup", () => {
  it("round-trips: export-all then parse yields N rounds with fresh ids", () => {
    const json = exportBackupJSON([mk("a"), mk("b")]);
    const rounds = parseImportFile(json);
    expect(rounds).toHaveLength(2);
    expect(rounds.map((r) => r.id)).not.toContain("a");
    expect(rounds.map((r) => r.id)).not.toContain("b");
  });

  it("parses a single-flow file into a 1-element array", () => {
    const single = JSON.stringify({ version: 2, round: mk("solo") });
    expect(parseImportFile(single)).toHaveLength(1);
  });

  it("throws on garbage", () => {
    expect(() => parseImportFile("not json")).toThrow();
  });
});
