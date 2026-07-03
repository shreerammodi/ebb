import { describe, it, expect } from "vitest";

import type { ArgumentNode, Speech } from "@/lib/model/types";

import { descendantIds, isValidMoveTarget, cursorAt, stepMoveCursor } from "./move";

const speeches: Speech[] = [
    { id: "s0", name: "1AC", side: "aff", seconds: 0 },
    { id: "s1", name: "1NC", side: "neg", seconds: 0 },
    { id: "s2", name: "2AC", side: "aff", seconds: 0 },
];

function node(p: Partial<ArgumentNode> & { id: string; speechId: string }): ArgumentNode {
    return {
        sheetId: "sh",
        parentId: null,
        row: 0,
        text: "",
        statuses: [],
        bold: false,
        highlight: false,
        ...p,
    };
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
        expect(
            isValidMoveTarget(tree, speeches, "c", {
                kind: "node",
                nodeId: "a",
            }),
        ).toBe(true);
    });

    it("rejects dropping a node onto itself", () => {
        expect(
            isValidMoveTarget(tree, speeches, "b", {
                kind: "node",
                nodeId: "b",
            }),
        ).toBe(false);
    });

    it("rejects dropping a node onto one of its descendants (cycle guard)", () => {
        // "a" onto "c" would make a's grandchild its parent.
        expect(
            isValidMoveTarget(tree, speeches, "a", {
                kind: "node",
                nodeId: "c",
            }),
        ).toBe(false);
    });

    it("rejects a target in a later column (parent must precede child)", () => {
        // move "a" (1AC) under "b" (1NC) — b is in a later column, illegal parent.
        expect(
            isValidMoveTarget(tree, speeches, "a", {
                kind: "node",
                nodeId: "b",
            }),
        ).toBe(false);
    });

    it("allows an empty cell as a rehome target", () => {
        expect(
            isValidMoveTarget(tree, speeches, "c", {
                kind: "empty",
                speechId: "s1",
                row: 0,
            }),
        ).toBe(true);
    });
});

describe("cursorAt / stepMoveCursor", () => {
    it("resolves a cell holding a node to that node", () => {
        // "a" sits at col 0, row 0.
        expect(cursorAt(tree, speeches, 0, 0)).toEqual({
            speechId: "s0",
            nodeId: "a",
        });
    });

    it("resolves an empty cell to an empty-cell cursor", () => {
        // col 1 row 1 is empty in this tree (b is at row 0).
        expect(cursorAt(tree, speeches, 1, 1)).toEqual({
            speechId: "s1",
            nodeId: "",
            row: 1,
        });
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

// ── Grab-to-link math ────────────────────────────────────────────────────────

import { isValidLinkTarget, linkSnapRow, linkRippleExclusions } from "./move";

const sp = (id: string, side: "aff" | "neg"): Speech => ({ id, name: id, side, seconds: 0 });
const linkSpeeches = [sp("1nc", "neg"), sp("2ac", "aff"), sp("1ar", "aff"), sp("2nr", "neg")];

describe("isValidLinkTarget", () => {
    // H is a unit in col 2 (1ar); P in col 1 (2ac); X in col 2.
    const nodes = [
        node({ id: "P", speechId: "2ac", row: 0 }),
        node({ id: "H", speechId: "1ar", row: 3 }),
        node({ id: "H2", speechId: "1ar", row: 4, unitId: "H" }),
        node({ id: "X", speechId: "1ar", row: 6 }),
        node({ id: "child", speechId: "2nr", row: 3, parentId: "H" }),
    ];

    it("accepts a strictly earlier column", () => {
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "P")).toBe(true);
    });
    it("rejects the same column", () => {
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "X")).toBe(false);
    });
    it("rejects the grabbed unit's own band (cycle)", () => {
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "child")).toBe(false);
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "H2")).toBe(false);
    });
    it("resolves a continuation target to a valid parent unit", () => {
        const withCont = [...nodes, node({ id: "P2", speechId: "2ac", row: 1, unitId: "P" })];
        expect(isValidLinkTarget(withCont, linkSpeeches, "H", "P2")).toBe(true);
    });
});

describe("linkSnapRow", () => {
    it("aligns beside the parent head when the parent has no answers in that column", () => {
        const nodes = [
            node({ id: "P", speechId: "2ac", row: 0 }),
            node({ id: "P2", speechId: "2ac", row: 1, unitId: "P" }),
            node({ id: "H", speechId: "1ar", row: 5 }),
        ];
        expect(linkSnapRow(nodes, "H", "P")).toBe(0);
    });

    it("stacks below the parent's existing answers in the linked column", () => {
        const nodes = [
            node({ id: "P", speechId: "2ac", row: 0 }),
            node({ id: "A1", speechId: "1ar", row: 0, parentId: "P" }),
            node({ id: "A1b", speechId: "1ar", row: 1, unitId: "A1" }),
            node({ id: "H", speechId: "1ar", row: 5 }),
        ];
        expect(linkSnapRow(nodes, "H", "P")).toBe(2);
    });
});

describe("linkRippleExclusions", () => {
    it("keeps the parent band in place during a snap", () => {
        const nodes = [
            node({ id: "P", speechId: "2ac", row: 0 }),
            node({ id: "P2", speechId: "2ac", row: 1, unitId: "P" }),
        ];
        expect(linkRippleExclusions(nodes, "P")).toEqual(new Set(["P", "P2"]));
    });
});
