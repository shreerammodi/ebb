import { describe, it, expect } from "vitest";
import type { ArgumentNode, Format } from "@/lib/model/types";
import { makeFormatByKey } from "@/lib/format/presets";
import {
  parentOf,
  firstChildOf,
  nodeAboveInColumn,
  nodeBelowInColumn,
  nextOpposingSpeech,
} from "./navigation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<ArgumentNode> & { id: string }): ArgumentNode {
  return {
    sheetId: "sheet1",
    speechId: "speech1",
    parentId: null,
    order: 0,
    text: "",
    statuses: [],
    bold: false,
    numberOverride: null,
    ...overrides,
  };
}

// ─── parentOf ─────────────────────────────────────────────────────────────────

describe("parentOf", () => {
  it("returns the parent node of nodeId", () => {
    const nodes = [makeNode({ id: "p" }), makeNode({ id: "c", parentId: "p" })];
    expect(parentOf(nodes, "c")?.id).toBe("p");
  });

  it("returns null when node has no parent", () => {
    const nodes = [makeNode({ id: "p" })];
    expect(parentOf(nodes, "p")).toBeNull();
  });

  it("returns null when nodeId not found", () => {
    expect(parentOf([], "x")).toBeNull();
  });
});

// ─── firstChildOf ─────────────────────────────────────────────────────────────

describe("firstChildOf", () => {
  it("returns the child with minimum order across speeches", () => {
    const nodes = [
      makeNode({ id: "p" }),
      makeNode({ id: "c2", parentId: "p", speechId: "spB", order: 2 }),
      makeNode({ id: "c1", parentId: "p", speechId: "spC", order: 1 }),
    ];
    expect(firstChildOf(nodes, "p", "sheet1")?.id).toBe("c1");
  });

  it("filters by sheetId", () => {
    const nodes = [
      makeNode({ id: "p" }),
      makeNode({ id: "other", parentId: "p", sheetId: "sheet2", order: 0 }),
      makeNode({ id: "c", parentId: "p", sheetId: "sheet1", order: 5 }),
    ];
    expect(firstChildOf(nodes, "p", "sheet1")?.id).toBe("c");
  });

  it("returns null when no children", () => {
    const nodes = [makeNode({ id: "p" })];
    expect(firstChildOf(nodes, "p", "sheet1")).toBeNull();
  });
});

// ─── nodeAboveInColumn ────────────────────────────────────────────────────────

describe("nodeAboveInColumn", () => {
  it("returns the node with next-lower order in same column", () => {
    const a = makeNode({ id: "a", order: 0 });
    const b = makeNode({ id: "b", order: 1 });
    const c = makeNode({ id: "c", order: 2 });
    expect(nodeAboveInColumn([a, b, c], c)?.id).toBe("b");
  });

  it("returns null at the top of the column", () => {
    const a = makeNode({ id: "a", order: 0 });
    expect(nodeAboveInColumn([a], a)).toBeNull();
  });

  it("ignores nodes in other columns", () => {
    const a = makeNode({ id: "a", order: 0 });
    const other = makeNode({ id: "o", order: 1, speechId: "sp2" });
    const c = makeNode({ id: "c", order: 5 });
    expect(nodeAboveInColumn([a, other, c], c)?.id).toBe("a");
  });
});

// ─── nodeBelowInColumn ────────────────────────────────────────────────────────

describe("nodeBelowInColumn", () => {
  it("returns the node with next-higher order in same column", () => {
    const a = makeNode({ id: "a", order: 0 });
    const b = makeNode({ id: "b", order: 1 });
    const c = makeNode({ id: "c", order: 2 });
    expect(nodeBelowInColumn([a, b, c], a)?.id).toBe("b");
  });

  it("returns null at the bottom of the column", () => {
    const a = makeNode({ id: "a", order: 0 });
    expect(nodeBelowInColumn([a], a)).toBeNull();
  });

  it("ignores other sheets", () => {
    const a = makeNode({ id: "a", order: 0 });
    const other = makeNode({ id: "o", order: 1, sheetId: "sheet2" });
    expect(nodeBelowInColumn([a, other], a)).toBeNull();
  });
});

// ─── nextOpposingSpeech ───────────────────────────────────────────────────────

describe("nextOpposingSpeech", () => {
  it("returns the first speech after speechId on the opposite side", () => {
    const fmt: Format = makeFormatByKey("policy");
    // speeches: 1AC(aff) 1NC(neg) 2AC(aff) Block(neg) 1AR(aff) 2NR(neg) 2AR(aff)
    const ac1 = fmt.speeches[0]; // 1AC aff
    const next = nextOpposingSpeech(fmt, ac1.id);
    expect(next?.id).toBe(fmt.speeches[1].id); // 1NC
  });

  it("skips same-side speeches", () => {
    const fmt: Format = makeFormatByKey("policy");
    const nc1 = fmt.speeches[1]; // 1NC neg
    const next = nextOpposingSpeech(fmt, nc1.id); // next aff is 2AC
    expect(next?.id).toBe(fmt.speeches[2].id);
  });

  it("returns null when no later opposing speech exists", () => {
    const fmt: Format = makeFormatByKey("policy");
    const last = fmt.speeches[fmt.speeches.length - 1]; // 2AR aff, last
    expect(nextOpposingSpeech(fmt, last.id)).toBeNull();
  });

  it("returns null when speechId not found", () => {
    const fmt: Format = makeFormatByKey("policy");
    expect(nextOpposingSpeech(fmt, "nope")).toBeNull();
  });
});
