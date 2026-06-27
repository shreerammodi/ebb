import { describe, it, expect } from "vitest";
import { colIndexOf, occupantAt, maxRow, rippleDown, rippleUp } from "./coords";
import type { ArgumentNode, Speech } from "@/lib/model/types";

const sp = (id: string): Speech => ({ id, name: id, side: "aff", seconds: 0 });
const speeches = [sp("a"), sp("b"), sp("c")];

const n = (id: string, speechId: string, row: number): ArgumentNode => ({
  id,
  sheetId: "s1",
  speechId,
  parentId: null,
  row,
  text: id,
  statuses: [],
  bold: false,
  numberOverride: null,
});

describe("coords", () => {
  it("colIndexOf finds the column, −1 when absent", () => {
    expect(colIndexOf(speeches, "b")).toBe(1);
    expect(colIndexOf(speeches, "zzz")).toBe(-1);
  });

  it("occupantAt finds a node at a cell, scoped to sheet", () => {
    const nodes = [n("x", "a", 0), n("y", "a", 1)];
    expect(occupantAt(nodes, "s1", "a", 1)?.id).toBe("y");
    expect(occupantAt(nodes, "s1", "a", 2)).toBeNull();
    expect(occupantAt(nodes, "other", "a", 0)).toBeNull();
  });

  it("maxRow returns the highest row in the sheet, −1 when empty", () => {
    expect(maxRow([n("x", "a", 0), n("y", "c", 4)], "s1")).toBe(4);
    expect(maxRow([], "s1")).toBe(-1);
  });

  it("rippleDown shifts rows >= fromRow across all columns", () => {
    const nodes = [n("x", "a", 0), n("y", "b", 1), n("z", "a", 2)];
    const out = rippleDown(nodes, "s1", 1);
    expect(out.find((m) => m.id === "x")!.row).toBe(0);
    expect(out.find((m) => m.id === "y")!.row).toBe(2);
    expect(out.find((m) => m.id === "z")!.row).toBe(3);
  });

  it("rippleUp shifts rows >= fromRow up, leaving lower rows alone", () => {
    const nodes = [n("x", "a", 0), n("y", "b", 2), n("z", "a", 3)];
    const out = rippleUp(nodes, "s1", 2);
    expect(out.find((m) => m.id === "x")!.row).toBe(0);
    expect(out.find((m) => m.id === "y")!.row).toBe(1);
    expect(out.find((m) => m.id === "z")!.row).toBe(2);
  });

  it("ripple only touches the target sheet", () => {
    const nodes = [n("x", "a", 1), { ...n("o", "a", 1), sheetId: "s2" }];
    const out = rippleDown(nodes, "s1", 0);
    expect(out.find((m) => m.id === "x")!.row).toBe(2);
    expect(out.find((m) => m.id === "o")!.row).toBe(1);
  });
});

import { spawnTarget, placeForSpawn, descendantIds, translateSubtree } from "./coords";

describe("spawn placement", () => {
  it("sibling targets next row, same column", () => {
    const nodes = [n("p", "a", 0)];
    const t = spawnTarget(nodes, "s1", speeches, nodes[0], "sibling");
    expect(t).toEqual({ speechId: "a", row: 1 });
  });

  it("response targets same row, next column", () => {
    const nodes = [n("p", "a", 0)];
    const t = spawnTarget(nodes, "s1", speeches, nodes[0], "response");
    expect(t).toEqual({ speechId: "b", row: 0 });
  });

  it("response off the last column is null", () => {
    const nodes = [n("p", "c", 0)];
    expect(spawnTarget(nodes, "s1", speeches, nodes[0], "response")).toBeNull();
  });

  it("placeForSpawn ripples when the sibling row is occupied", () => {
    // contentions at a:0,1,2 ; first response already at b:0
    const nodes = [n("c1", "a", 0), n("c2", "a", 1), n("c3", "a", 2), n("r1", "b", 0)];
    const res = placeForSpawn(nodes, "s1", speeches, nodes[3], "sibling")!;
    expect({ speechId: res.speechId, row: res.row }).toEqual({
      speechId: "b",
      row: 1,
    });
    // c2 and c3 rippled down to keep alignment
    expect(res.nodes.find((m) => m.id === "c2")!.row).toBe(2);
    expect(res.nodes.find((m) => m.id === "c3")!.row).toBe(3);
  });

  it("placeForSpawn does NOT ripple when the target cell is free", () => {
    const nodes = [n("p", "a", 0)];
    const res = placeForSpawn(nodes, "s1", speeches, nodes[0], "response")!;
    expect({ speechId: res.speechId, row: res.row }).toEqual({
      speechId: "b",
      row: 0,
    });
    expect(res.nodes).toEqual(nodes); // untouched
  });
});

describe("subtree", () => {
  it("descendantIds collects root + transitive children", () => {
    const nodes = [
      n("root", "a", 0),
      { ...n("c", "b", 0), parentId: "root" },
      { ...n("gc", "c", 0), parentId: "c" },
      n("other", "a", 1),
    ];
    expect(descendantIds(nodes, "root")).toEqual(new Set(["root", "c", "gc"]));
  });

  it("translateSubtree shifts the whole subtree by delta", () => {
    const nodes = [n("root", "a", 0), { ...n("c", "b", 0), parentId: "root" }];
    const res = translateSubtree(nodes, speeches, "root", 0, 2);
    expect(res.ok).toBe(true);
    expect(res.nodes.find((m) => m.id === "root")!.row).toBe(2);
    expect(res.nodes.find((m) => m.id === "c")!.row).toBe(2);
  });

  it("translateSubtree rejects a collision with a non-subtree node", () => {
    const nodes = [n("root", "a", 0), n("blocker", "a", 2)];
    const res = translateSubtree(nodes, speeches, "root", 0, 2);
    expect(res.ok).toBe(false);
    expect(res.nodes).toEqual(nodes);
  });

  it("translateSubtree rejects moving out of column bounds", () => {
    const nodes = [n("root", "c", 0)];
    const res = translateSubtree(nodes, speeches, "root", 1, 0);
    expect(res.ok).toBe(false);
  });
});

// ── Band-aware sibling placement + reserved cells ────────────────────────────

import { subtreeMaxRow, isReservedCell } from "./coords";

/** Node with an explicit parent (the module `n` helper hard-codes parentId null). */
const cn = (id: string, speechId: string, row: number, parentId: string | null): ArgumentNode => ({
  ...n(id, speechId, row),
  parentId,
});

/** arg1 in column "a" with six responses stacked in column "b" (rows 0..5). */
function bandFixture(): ArgumentNode[] {
  return [
    n("arg1", "a", 0),
    cn("r1", "b", 0, "arg1"),
    cn("r2", "b", 1, "arg1"),
    cn("r3", "b", 2, "arg1"),
    cn("r4", "b", 3, "arg1"),
    cn("r5", "b", 4, "arg1"),
    cn("r6", "b", 5, "arg1"),
  ];
}

describe("subtreeMaxRow", () => {
  it("returns the deepest row spanned by a node's whole subtree", () => {
    expect(subtreeMaxRow(bandFixture(), "arg1")).toBe(5);
  });

  it("equals the node's own row when it has no children", () => {
    expect(subtreeMaxRow(bandFixture(), "r3")).toBe(2);
  });
});

describe("band-aware sibling placement", () => {
  it("places a sibling of a banded parent BELOW the whole band", () => {
    const nodes = bandFixture();
    const t = spawnTarget(nodes, "s1", speeches, nodes[0], "sibling");
    // Not row 1 (inside the band) — row 6, just past response6.
    expect(t).toEqual({ speechId: "a", row: 6 });
  });

  it("does not ripple the band when the sibling lands on the empty row below", () => {
    const nodes = bandFixture();
    const res = placeForSpawn(nodes, "s1", speeches, nodes[0], "sibling")!;
    expect({ speechId: res.speechId, row: res.row }).toEqual({
      speechId: "a",
      row: 6,
    });
    // Responses stay contiguous at 0..5.
    expect(res.nodes.find((m) => m.id === "r1")!.row).toBe(0);
    expect(res.nodes.find((m) => m.id === "r6")!.row).toBe(5);
  });

  it("a sibling of a leaf response still stacks directly below it", () => {
    const nodes = bandFixture();
    const r3 = nodes.find((m) => m.id === "r3")!;
    const t = spawnTarget(nodes, "s1", speeches, r3, "sibling");
    expect(t).toEqual({ speechId: "b", row: 3 });
  });
});

describe("isReservedCell", () => {
  it("reserves empty parent-column cells within a response band", () => {
    const nodes = bandFixture();
    expect(isReservedCell(nodes, "s1", "a", 1)).toBe(true);
    expect(isReservedCell(nodes, "s1", "a", 5)).toBe(true);
  });

  it("does not reserve the band-bottom+1 cell or the parent's own cell", () => {
    const nodes = bandFixture();
    expect(isReservedCell(nodes, "s1", "a", 6)).toBe(false);
    expect(isReservedCell(nodes, "s1", "a", 0)).toBe(false); // occupied by arg1
  });

  it("does not reserve occupied cells", () => {
    const nodes = bandFixture();
    expect(isReservedCell(nodes, "s1", "b", 2)).toBe(false); // r3 lives here
  });
});

// ── Excel data-edge jump + corner navigation ─────────────────────────────────

import { jumpTarget, cornerTarget } from "./coords";

describe("jumpTarget (Excel Ctrl/Cmd+Arrow)", () => {
  it("extends to the end of a contiguous run downward", () => {
    // a:0,1,2 filled, a:3 empty, a:5 filled
    const nodes = [n("x0", "a", 0), n("x1", "a", 1), n("x2", "a", 2), n("x5", "a", 5)];
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "a", row: 0 }, "down");
    expect(t).toEqual({ speechId: "a", row: 2 }); // end of the 0..2 run
  });

  it("from the end of a run, skips the gap to the next filled cell", () => {
    const nodes = [n("x2", "a", 2), n("x5", "a", 5)];
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "a", row: 2 }, "down");
    expect(t).toEqual({ speechId: "a", row: 5 });
  });

  it("from an empty cell, jumps to the next filled cell", () => {
    const nodes = [n("x5", "a", 5)];
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "a", row: 0 }, "down");
    expect(t).toEqual({ speechId: "a", row: 5 });
  });

  it("stays put when already at the bottom of the used range", () => {
    const nodes = [n("x5", "a", 5)];
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "a", row: 5 }, "down");
    expect(t).toEqual({ speechId: "a", row: 5 });
  });

  it("jumps up to row 0 when no filled cell lies above", () => {
    const nodes = [n("x5", "a", 5)];
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "a", row: 3 }, "up");
    expect(t).toEqual({ speechId: "a", row: 0 });
  });

  it("jumps right across columns to the next filled cell", () => {
    const nodes = [n("x", "c", 0)];
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "a", row: 0 }, "right");
    expect(t).toEqual({ speechId: "c", row: 0 });
  });

  it("never lands on a reserved cell (stays put)", () => {
    // arg in col a with a two-row response band in col b → a:1 reserved.
    const nodes = [n("arg", "a", 0), cn("r1", "b", 0, "arg"), cn("r2", "b", 1, "arg")];
    // From the second response, jump left: a:1 is reserved, nothing else left.
    const t = jumpTarget(nodes, "s1", speeches, { speechId: "b", row: 1 }, "left");
    expect(t).toEqual({ speechId: "b", row: 1 });
  });
});

describe("cornerTarget", () => {
  it("home jumps to the top-left cell", () => {
    const nodes = [n("x", "c", 4)];
    expect(cornerTarget(nodes, "s1", speeches, "home")).toEqual({
      speechId: "a",
      row: 0,
    });
  });

  it("end jumps to the bottom-right-most filled cell", () => {
    const nodes = [n("x", "a", 5), n("y", "c", 5), n("z", "b", 2)];
    expect(cornerTarget(nodes, "s1", speeches, "end")).toEqual({
      speechId: "c",
      row: 5,
    });
  });

  it("end falls back to top-left on an empty sheet", () => {
    expect(cornerTarget([], "s1", speeches, "end")).toEqual({
      speechId: "a",
      row: 0,
    });
  });
});
