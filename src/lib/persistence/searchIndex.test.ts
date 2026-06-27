import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { buildSearchText, writeSearchIndex, deleteSearchIndex } from "./searchIndex";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: "r1",
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: {
      id: "f",
      name: "Policy",
      speeches: [],
      prepSeconds: { aff: 240, neg: 240 },
    },
    scouting: {
      ...emptyScouting(),
      affSchool: "Westwood",
      tournament: "Berkeley",
    },
    sheets: [],
    nodes: [
      {
        id: "n1",
        sheetId: "s",
        speechId: "1ac",
        parentId: null,
        row: 0,
        text: "perm do both",
        statuses: [],
        bold: false,
      },
    ],
    groups: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await db.searchIndex.clear();
});

describe("buildSearchText", () => {
  it("includes scouting fields and all node text, lowercased", () => {
    const text = buildSearchText(round());
    expect(text).toContain("westwood");
    expect(text).toContain("berkeley");
    expect(text).toContain("perm do both");
  });
});

describe("searchIndex CRUD", () => {
  it("writes and deletes a row", async () => {
    await writeSearchIndex(round());
    expect((await db.searchIndex.get("r1"))?.searchText).toContain("perm do both");
    await deleteSearchIndex("r1");
    expect(await db.searchIndex.get("r1")).toBeUndefined();
  });
});

describe("backfillSearchIndex", () => {
  it("creates rows only for rounds missing one", async () => {
    await db.rounds.clear();
    await db.rounds.put(round({ id: "x" }));
    await db.searchIndex.clear();
    const { backfillSearchIndex } = await import("./searchIndex");
    await backfillSearchIndex();
    expect((await db.searchIndex.get("x"))?.searchText).toContain("perm do both");
  });
});
