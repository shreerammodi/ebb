import { describe, it, expect } from "vitest";
import { normalizeRound, emptyScouting } from "./normalize";
import type { Round } from "./types";

function legacy(): any {
  return {
    id: "r1",
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: {
      id: "f",
      name: "Policy",
      speeches: [],
      prepSeconds: { aff: 0, neg: 0 },
    },
    meta: {},
    sheets: [{ id: "s1", title: "Aff", group: "aff", order: 0 }],
    nodes: [],
    topic: "old topic",
  };
}

describe("normalizeRound", () => {
  it("adds scouting and a pinned CX sheet when missing", () => {
    const r = normalizeRound(legacy()) as Round;
    expect(r.scouting).toEqual(emptyScouting());
    expect(r.sheets.some((s) => s.kind === "cx")).toBe(true);
  });
  it('defaults existing sheets to kind "flow"', () => {
    const r = normalizeRound(legacy()) as Round;
    expect(r.sheets.find((s) => s.id === "s1")!.kind).toBe("flow");
  });
  it("drops the legacy topic field", () => {
    const r = normalizeRound(legacy()) as any;
    expect(r.topic).toBeUndefined();
  });
  it("does not add a second CX sheet if one exists", () => {
    const base = legacy();
    base.sheets.push({
      id: "cx1",
      title: "CX",
      group: "aff",
      order: 1,
      kind: "cx",
    });
    const r = normalizeRound(base) as Round;
    expect(r.sheets.filter((s) => s.kind === "cx").length).toBe(1);
  });

  it("folds legacy round.meta into scouting and drops meta", () => {
    const legacy = {
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
      meta: { tournament: "TOC", judge: "Smith", roundLabel: "Octos" },
      scouting: undefined,
      sheets: [],
      nodes: [],
      groups: [],
    } as unknown as Parameters<typeof normalizeRound>[0];

    const r = normalizeRound(legacy);
    expect(r.scouting.tournament).toBe("TOC");
    expect(r.scouting.judge).toBe("Smith");
    expect(r.scouting.round).toBe("Octos");
    expect((r as unknown as { meta?: unknown }).meta).toBeUndefined();
  });
});

describe("normalizeRound deletedAt", () => {
  it("preserves a deletedAt timestamp", () => {
    const raw = {
      id: "r1",
      createdAt: 1,
      updatedAt: 2,
      deletedAt: 1234,
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
    } as unknown as Round;
    expect(normalizeRound(raw).deletedAt).toBe(1234);
  });

  it("leaves deletedAt undefined for a live round", () => {
    const raw = {
      id: "r2",
      createdAt: 1,
      updatedAt: 2,
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
    } as unknown as Round;
    expect(normalizeRound(raw).deletedAt ?? null).toBeNull();
  });
});
