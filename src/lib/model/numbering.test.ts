import { describe, it, expect } from "vitest";
import type { ArgumentNode } from "@/lib/model/types";
import { numberFor } from "@/lib/model/numbering";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<ArgumentNode> & { id: string }): ArgumentNode {
  return {
    sheetId: "sheet1",
    speechId: "speech1",
    parentId: "parent1",
    row: 0,
    text: "",
    statuses: [],
    bold: false,
    numberOverride: null,
    ...overrides,
  };
}

// ─── numberFor ───────────────────────────────────────────────────────────────

describe("numberFor", () => {
  it("returns null for a root node (parentId === null)", () => {
    const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: null })];
    expect(numberFor(nodes, "a")).toBeNull();
  });

  it("returns 1 for the only child", () => {
    const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: "p", row: 0 })];
    expect(numberFor(nodes, "a")).toBe(1);
  });

  it("returns 1 for the first of two siblings and 2 for the second", () => {
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p", row: 0 }),
      makeNode({ id: "b", parentId: "p", row: 1 }),
    ];
    expect(numberFor(nodes, "a")).toBe(1);
    expect(numberFor(nodes, "b")).toBe(2);
  });

  it("numbers are based on order not insertion sequence", () => {
    // 'b' has lower order so it is sibling #1, 'a' is #2
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p", row: 1 }),
      makeNode({ id: "b", parentId: "p", row: 0 }),
    ];
    expect(numberFor(nodes, "b")).toBe(1);
    expect(numberFor(nodes, "a")).toBe(2);
  });

  it("does not count siblings with a different parentId", () => {
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p1", row: 0 }),
      makeNode({ id: "b", parentId: "p2", row: 0 }),
    ];
    // 'a' is the only child of p1 → should be 1
    expect(numberFor(nodes, "a")).toBe(1);
  });

  it("does not count siblings with a different sheetId", () => {
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p", sheetId: "sheet1", row: 0 }),
      makeNode({ id: "b", parentId: "p", sheetId: "sheet2", row: 1 }),
    ];
    expect(numberFor(nodes, "a")).toBe(1);
  });

  it("does not count siblings with a different speechId", () => {
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p", speechId: "speech1", row: 0 }),
      makeNode({ id: "b", parentId: "p", speechId: "speech2", row: 1 }),
    ];
    expect(numberFor(nodes, "a")).toBe(1);
  });

  it("applies override restart: [null, 5, null] → [1, 5, 6]", () => {
    const nodes: ArgumentNode[] = [
      makeNode({
        id: "a",
        parentId: "p",
        row: 0,
        numberOverride: null,
      }),
      makeNode({ id: "b", parentId: "p", row: 1, numberOverride: 5 }),
      makeNode({
        id: "c",
        parentId: "p",
        row: 2,
        numberOverride: null,
      }),
    ];
    expect(numberFor(nodes, "a")).toBe(1);
    expect(numberFor(nodes, "b")).toBe(5);
    expect(numberFor(nodes, "c")).toBe(6);
  });

  it("applies an override at position 0, then increments", () => {
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p", row: 0, numberOverride: 10 }),
      makeNode({
        id: "b",
        parentId: "p",
        row: 1,
        numberOverride: null,
      }),
    ];
    expect(numberFor(nodes, "a")).toBe(10);
    expect(numberFor(nodes, "b")).toBe(11);
  });

  it("returns null when nodeId is not found", () => {
    const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: "p", row: 0 })];
    expect(numberFor(nodes, "nonexistent")).toBeNull();
  });

  it("returns null for an empty nodes array", () => {
    expect(numberFor([], "a")).toBeNull();
  });

  it("handles undefined numberOverride the same as null (increments normally)", () => {
    const node: ArgumentNode = {
      id: "a",
      sheetId: "sheet1",
      speechId: "speech1",
      parentId: "p",
      row: 0,
      text: "",
      statuses: [],
      bold: false,
      // numberOverride intentionally omitted (undefined)
    };
    expect(numberFor([node], "a")).toBe(1);
  });

  it("sibling counter does not bleed across different parent groups", () => {
    // p1 has 3 children, p2 has 1 child; p2's child should still be #1
    const nodes: ArgumentNode[] = [
      makeNode({ id: "a", parentId: "p1", row: 0 }),
      makeNode({ id: "b", parentId: "p1", row: 1 }),
      makeNode({ id: "c", parentId: "p1", row: 2 }),
      makeNode({ id: "d", parentId: "p2", row: 0 }),
    ];
    expect(numberFor(nodes, "d")).toBe(1);
  });
});
