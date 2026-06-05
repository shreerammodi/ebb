import { describe, it, expect } from "vitest";
import { buildLayout } from "./layout";
import type { ArgumentNode, Speech } from "@/lib/model/types";

const speeches: Speech[] = [
  { id: "s0", name: "1AC", side: "aff", seconds: 0 },
  { id: "s1", name: "1NC", side: "neg", seconds: 0 },
];

function node(p: Partial<ArgumentNode> & { id: string; speechId: string }): ArgumentNode {
  return { sheetId: "sh", parentId: null, order: 0, text: "", statuses: [], bold: false, ...p };
}

describe("buildLayout", () => {
  it("places a parent spanning its two children", () => {
    const nodes = [
      node({ id: "p", speechId: "s0" }),
      node({ id: "c1", speechId: "s1", parentId: "p", order: 0 }),
      node({ id: "c2", speechId: "s1", parentId: "p", order: 1 }),
    ];
    const { placed, totalRows } = buildLayout(nodes, speeches);
    const parent = placed.find((p) => p.node.id === "p")!;
    expect(parent.col).toBe(0);
    expect(parent.startRow).toBe(0);
    expect(parent.rowSpan).toBe(2);
    expect(totalRows).toBe(2);
  });

  it("places roots by sheet-wide order, not by column", () => {
    const sps: Speech[] = [
      { id: "1ac", name: "1ac", side: "aff", seconds: 0 },
      { id: "1nc", name: "1nc", side: "neg", seconds: 0 },
    ];
    const nodes = [
      node({ id: "a", speechId: "1nc", order: 0 }),
      node({ id: "b", speechId: "1ac", order: 1 }),
    ];
    const { placed } = buildLayout(nodes, sps);
    const a = placed.find((p) => p.node.id === "a")!;
    const b = placed.find((p) => p.node.id === "b")!;
    expect(a.startRow).toBe(0);
    expect(a.col).toBe(1);
    expect(b.startRow).toBe(1);
    expect(b.col).toBe(0);
  });
});
