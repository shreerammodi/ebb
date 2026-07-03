import { describe, it, expect } from "vitest";

import type { ArgumentNode, Speech } from "@/lib/model/types";

import {
    colIndexOf,
    occupantAt,
    maxRow,
    rippleDown,
    rippleUp,
    ancestorIds,
    descendantIds,
    translateSubtree,
    translateUnit,
} from "./coords";

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
    highlight: false,
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

    it("rippleDown with exclude set skips excluded node ids", () => {
        const nodes = [n("x", "a", 0), n("y", "b", 1), n("z", "a", 2)];
        const out = rippleDown(nodes, "s1", 1, 1, new Set(["y"]));
        expect(out.find((m) => m.id === "x")!.row).toBe(0);
        expect(out.find((m) => m.id === "y")!.row).toBe(1); // excluded
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

import { spawnTarget, placeForSpawn } from "./coords";

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

    it("response does NOT ripple just because the parent's row holds other columns", () => {
        // A (a:0) → B (b:0, child of A). Responding to B lands in c:0 (the empty
        // cell beside B). The row is "occupied" by A, but A is the PARENT chain, not
        // a collision. Rippling here would push B (and A) down a row while the new
        // response stayed put — leaving the response ABOVE its parent (the bug).
        const nodes = [n("A", "a", 0), cnResp("B", "b", 0, "A")];
        const res = placeForSpawn(nodes, "s1", speeches, nodes[1], "response")!;
        expect({ speechId: res.speechId, row: res.row }).toEqual({ speechId: "c", row: 0 });
        // A and B stay on row 0 — the response will join their row beside B.
        expect(res.nodes.find((m) => m.id === "A")!.row).toBe(0);
        expect(res.nodes.find((m) => m.id === "B")!.row).toBe(0);
    });

    it("response ripples an unrelated occupant but keeps the parent on its row", () => {
        // A at (a,0), bare node B at (b,0). Responding to A targets (b,0) which is
        // occupied by an unrelated node. B should be pushed down; A stays on row 0;
        // the new response lands at (b,0) beside A — NOT above A.
        const nodes = [n("A", "a", 0), n("B", "b", 0)];
        const res = placeForSpawn(nodes, "s1", speeches, nodes[0], "response")!;
        expect({ speechId: res.speechId, row: res.row }).toEqual({ speechId: "b", row: 0 });
        // A stays on row 0.
        expect(res.nodes.find((m) => m.id === "A")!.row).toBe(0);
        // B pushed down to row 1.
        expect(res.nodes.find((m) => m.id === "B")!.row).toBe(1);
    });

    it("response ripples the parent's own existing response but keeps parent fixed", () => {
        // A at (a,0) with existing response R1 at (b,0). Responding to A again:
        // R1 gets pushed down, A stays on row 0, new response lands at (b,0).
        const nodes = [n("A", "a", 0), cnResp("R1", "b", 0, "A")];
        const res = placeForSpawn(nodes, "s1", speeches, nodes[0], "response")!;
        expect({ speechId: res.speechId, row: res.row }).toEqual({ speechId: "b", row: 0 });
        // A stays on row 0.
        expect(res.nodes.find((m) => m.id === "A")!.row).toBe(0);
        // R1 pushed down to row 1.
        expect(res.nodes.find((m) => m.id === "R1")!.row).toBe(1);
    });
});

/** Node with an explicit parent, local to the spawn-placement block. */
const cnResp = (id: string, speechId: string, row: number, parentId: string): ArgumentNode => ({
    ...n(id, speechId, row),
    parentId,
});

describe("ancestorIds", () => {
    it("collects the node and its parent chain up to root", () => {
        const nodes = [
            n("root", "a", 0),
            { ...n("c", "b", 0), parentId: "root" },
            { ...n("gc", "c", 0), parentId: "c" },
            n("other", "a", 1),
        ];
        expect(ancestorIds(nodes, "gc")).toEqual(new Set(["gc", "c", "root"]));
    });

    it("returns just the node when it has no parent", () => {
        const nodes = [n("root", "a", 0), n("other", "b", 0)];
        expect(ancestorIds(nodes, "root")).toEqual(new Set(["root"]));
    });

    it("is cycle-guarded", () => {
        const a = { ...n("A", "a", 0), parentId: "B" };
        const b = { ...n("B", "b", 0), parentId: "A" };
        const nodes = [a, b];
        // Should not infinite-loop; collects both.
        expect(ancestorIds(nodes, "A")).toEqual(new Set(["A", "B"]));
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

    it("translateSubtree ripples the blocker down on collision instead of rejecting", () => {
        const nodes = [n("root", "a", 0), n("blocker", "a", 2)];
        const res = translateSubtree(nodes, speeches, "root", 0, 2);
        expect(res.ok).toBe(true);
        // root moves from row 0 → row 2; blocker (at row 2) is pushed down by
        // the subtree span (1 row) to row 3.
        expect(res.nodes.find((m) => m.id === "root")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "blocker")!.row).toBe(3);
    });

    it("translateSubtree ripple preserves the moving subtree's internal structure", () => {
        // root at a:0 with child at b:0; blocker at a:2. Moving the subtree
        // down 2 rows should ripple the blocker to row 4 (span = 1 row since
        // both root and child land on the same row).
        const nodes = [
            n("root", "a", 0),
            { ...n("child", "b", 0), parentId: "root" },
            n("blocker", "a", 2),
        ];
        const res = translateSubtree(nodes, speeches, "root", 0, 2);
        expect(res.ok).toBe(true);
        expect(res.nodes.find((m) => m.id === "root")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "child")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "blocker")!.row).toBe(3);
    });

    it("translateSubtree rejects moving out of column bounds", () => {
        const nodes = [n("root", "c", 0)];
        const res = translateSubtree(nodes, speeches, "root", 1, 0);
        expect(res.ok).toBe(false);
    });

    it("translateSubtree rejects moving a non-root node to its parent's column", () => {
        // child at b:0 (parent root at a:0). Moving the child subtree
        // (child only, not root) -1 column puts child in col a. Its parent
        // (root) is in col a. parent.col(a=0) >= child.col(a=0). Invalid.
        const nodes = [n("root", "a", 0), { ...n("child", "b", 0), parentId: "root" }];
        const res = translateSubtree(nodes, speeches, "child", -1, 0);
        expect(res.ok).toBe(false);
    });

    it("translateSubtree rejects a multi-row subtree move that would exceed column bounds", () => {
        // root at b:0 with child at c:0. Moving +1 would put child off the
        // last column. Rejected before any mutation.
        const nodes = [n("root", "b", 0), { ...n("child", "c", 0), parentId: "root" }];
        const res = translateSubtree(nodes, speeches, "root", 1, 0);
        expect(res.ok).toBe(false);
    });

    it("translateSubtree allows moving a root subtree to any valid position", () => {
        // root at a:0 with child at b:0. Moving the whole subtree +1 column
        // puts root in b and child in c — still parent.col < child.col. Valid.
        const nodes = [n("root", "a", 0), { ...n("child", "b", 0), parentId: "root" }];
        const res = translateSubtree(nodes, speeches, "root", 1, 0);
        expect(res.ok).toBe(true);
        expect(res.nodes.find((m) => m.id === "root")!.speechId).toBe("b");
        expect(res.nodes.find((m) => m.id === "child")!.speechId).toBe("c");
    });

    it("translateSubtree no-op on zero delta", () => {
        const nodes = [n("root", "a", 0)];
        const res = translateSubtree(nodes, speeches, "root", 0, 0);
        expect(res.ok).toBe(true);
        expect(res.nodes).toEqual(nodes);
    });

    it("translateSubtree alignment: no two nodes share a cell after move", () => {
        const nodes = [
            n("root", "a", 0),
            { ...n("child", "b", 0), parentId: "root" },
            n("blocker1", "a", 2),
            n("blocker2", "b", 2),
        ];
        const res = translateSubtree(nodes, speeches, "root", 0, 2);
        expect(res.ok).toBe(true);
        const cells = new Set(res.nodes.map((n) => `${n.sheetId}:${n.speechId}:${n.row}`));
        expect(cells.size).toBe(res.nodes.length);
    });

    it("translateSubtree alignment: parent<col<child invariant holds for all valid moves", () => {
        const nodes = [
            n("root", "a", 0),
            { ...n("child", "b", 0), parentId: "root" },
            { ...n("grandchild", "c", 0), parentId: "child" },
        ];
        for (let dCol = -2; dCol <= 2; dCol++) {
            for (let dRow = -2; dRow <= 3; dRow++) {
                const res = translateSubtree(nodes, speeches, "root", dCol, dRow);
                if (!res.ok) continue;
                const colOf2 = new Map(
                    res.nodes.map((n) => [n.id, speeches.findIndex((s) => s.id === n.speechId)]),
                );
                for (const nn of res.nodes) {
                    if (nn.parentId === null) continue;
                    const pc = colOf2.get(nn.parentId);
                    const cc = colOf2.get(nn.id);
                    if (pc !== undefined && cc !== undefined) {
                        expect(pc).toBeLessThan(cc);
                    }
                }
                const cells = new Set(res.nodes.map((n) => `${n.speechId}:${n.row}`));
                expect(cells.size).toBe(res.nodes.length);
            }
        }
    });

    it("translateSubtree alignment: ripple clears exact gap for multi-row subtree", () => {
        const nodes = [
            n("arg1", "a", 0),
            { ...n("resp1", "b", 0), parentId: "arg1" },
            n("blocker", "a", 2),
        ];
        const res = translateSubtree(nodes, speeches, "arg1", 0, 2);
        expect(res.ok).toBe(true);
        expect(res.nodes.find((m) => m.id === "arg1")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "resp1")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "blocker")!.row).toBe(3);
    });
});

// ── Band-aware sibling placement + reserved cells ────────────────────────────

import { isReservedCell } from "./coords";

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

// ── Unit-aware spawn + reserved cells ────────────────────────────────────────

/** Node carrying a unitId, keyed into an existing unit. */
const un = (id: string, speechId: string, row: number, unitId: string): ArgumentNode => ({
    ...n(id, speechId, row),
    unitId,
});
const byId = (nodes: ArgumentNode[], id: string) => nodes.find((x) => x.id === id)!;

describe("spawnTarget with units", () => {
    // 2-cell unit (a row0, b row1 keyed "a") with a response answering a.
    const nodes = [n("a", "a", 0), un("b", "a", 1, "a"), cn("r", "b", 0, "a")];

    it("continue lands directly below the source cell", () => {
        expect(spawnTarget(nodes, "s1", speeches, byId(nodes, "a"), "continue")).toEqual({
            speechId: "a",
            row: 1,
        });
    });

    it("sibling lands below the whole unit band, from any member", () => {
        expect(spawnTarget(nodes, "s1", speeches, byId(nodes, "b"), "sibling")).toEqual({
            speechId: "a",
            row: 2,
        });
    });
});

describe("placeForSpawn continue", () => {
    it("ripples the full row when the target row is occupied", () => {
        const nodes = [n("a", "a", 0), n("z", "b", 1)];
        const placed = placeForSpawn(nodes, "s1", speeches, byId(nodes, "a"), "continue")!;
        expect(placed.row).toBe(1);
        expect(placed.nodes.find((m) => m.id === "z")!.row).toBe(2);
    });
});

describe("isReservedCell with units", () => {
    it("reserves the empty parent-column rows beside a multi-cell response unit", () => {
        // P (col a, row0) answered by response unit R1(row0)+R2(row1) in col b:
        // P's column row 1 sits beside R2 and is band interior.
        const nodes = [n("P", "a", 0), cn("R1", "b", 0, "P"), un("R2", "b", 1, "R1")];
        expect(isReservedCell(nodes, "s1", "a", 1)).toBe(true);
    });
});

describe("translateUnit", () => {
    it("moves members and their responses together, rippling collisions", () => {
        const nodes = [n("H", "b", 5), un("H2", "b", 6, "H"), n("Z", "b", 0)];
        const { nodes: moved, ok } = translateUnit(nodes, speeches, "H2", -5);
        expect(ok).toBe(true);
        expect(byId(moved, "H").row).toBe(0);
        expect(byId(moved, "H2").row).toBe(1);
        expect(byId(moved, "Z").row).toBe(2); // rippled out of the way
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
