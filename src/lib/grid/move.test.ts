import { describe, it, expect } from "vitest";
import type { ArgumentNode, Speech } from "@/lib/model/types";
import { descendantIds, isValidMoveTarget, cursorAt, stepMoveCursor } from "./move";

const speeches: Speech[] = [
  { id: "s0", name: "1AC", side: "aff", seconds: 0 },
  { id: "s1", name: "1NC", side: "neg", seconds: 0 },
  { id: "s2", name: "2AC", side: "aff", seconds: 0 },
];

function node(p: Partial<ArgumentNode> & { id: string; speechId: string }): ArgumentNode {
  return { sheetId: "sh", parentId: null, order: 0, text: "", statuses: [], bold: false, ...p };
}

// 1AC root "a" → 1NC child "b" → 2AC grandchild "c"
const tree = [
  node({ id: "a", speechId: "s0" }),
  node({ id: "b", speechId: "s1", parentId: "a" }),
  node({ id: "c", speechId: "s2", parentId: "b" }),
];

describe("descendantIds", () => {
  it("collects children and grandchildren, excluding the source", () => {
    const d = descendantIds(tree, "a");
    expect([...d].sort()).toEqual(["b", "c"]);
    expect(d.has("a")).toBe(false);
  });

  it("returns empty for a leaf", () => {
    expect(descendantIds(tree, "c").size).toBe(0);
  });
});

describe("isValidMoveTarget", () => {
  it("allows reparenting onto a node in an earlier column", () => {
    // move "c" (2AC) under "a" (1AC) — earlier column, not a descendant.
    expect(isValidMoveTarget(tree, speeches, "c", { kind: "node", nodeId: "a" })).toBe(true);
  });

  it("rejects dropping a node onto itself", () => {
    expect(isValidMoveTarget(tree, speeches, "b", { kind: "node", nodeId: "b" })).toBe(false);
  });

  it("rejects dropping a node onto one of its descendants (cycle guard)", () => {
    // "a" onto "c" would make a's grandchild its parent.
    expect(isValidMoveTarget(tree, speeches, "a", { kind: "node", nodeId: "c" })).toBe(false);
  });

  it("rejects a target in a later column (parent must precede child)", () => {
    // move "a" (1AC) under "b" (1NC) — b is in a later column, illegal parent.
    expect(isValidMoveTarget(tree, speeches, "a", { kind: "node", nodeId: "b" })).toBe(false);
  });

  it("allows an empty cell as a rehome target", () => {
    expect(isValidMoveTarget(tree, speeches, "c", { kind: "empty", speechId: "s1", row: 0 })).toBe(
      true,
    );
  });
});

describe("cursorAt / stepMoveCursor", () => {
  it("resolves a cell holding a node to that node", () => {
    // "a" sits at col 0, row 0.
    expect(cursorAt(tree, speeches, 0, 0)).toEqual({ speechId: "s0", nodeId: "a" });
  });

  it("resolves an empty cell to an empty-cell cursor", () => {
    // col 1 row 1 is empty in this tree (b is at row 0).
    expect(cursorAt(tree, speeches, 1, 1)).toEqual({ speechId: "s1", nodeId: "", row: 1 });
  });

  it("steps right from the source node into the next column", () => {
    const next = stepMoveCursor(tree, speeches, { speechId: "s0", nodeId: "a" }, "right");
    expect(next.speechId).toBe("s1");
    expect(next.nodeId).toBe("b");
  });

  it("clamps at the left edge", () => {
    const next = stepMoveCursor(tree, speeches, { speechId: "s0", nodeId: "a" }, "left");
    expect(next.speechId).toBe("s0");
  });
});
