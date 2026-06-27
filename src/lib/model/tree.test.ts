import { describe, it, expect } from "vitest";

import type { ArgumentNode, NodeStatus } from "@/lib/model/types";

import {
    childrenOf,
    rootsOf,
    placeNodeAt,
    orphanNode,
    deleteSubtree,
    setParent,
    updateText,
    toggleStatus,
    toggleBold,
} from "./tree";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<ArgumentNode> & { id: string }): ArgumentNode {
    return {
        sheetId: "sheet1",
        speechId: "speech1",
        parentId: null,
        row: 0,
        text: "",
        statuses: [],
        bold: false,
        numberOverride: null,
        ...overrides,
    };
}

// ─── bold ─────────────────────────────────────────────────────────────────────

describe("bold", () => {
    it("placeNodeAt defaults bold to false", () => {
        const { node } = placeNodeAt([], {
            sheetId: "s1",
            speechId: "1ac",
            parentId: null,
            row: 0,
        });
        expect(node.bold).toBe(false);
    });

    it("toggleBold flips bold and is pure", () => {
        const { nodes, node } = placeNodeAt([], {
            sheetId: "s1",
            speechId: "1ac",
            parentId: null,
            row: 0,
        });
        const on = toggleBold(nodes, node.id);
        expect(on.find((n) => n.id === node.id)!.bold).toBe(true);
        expect(nodes.find((n) => n.id === node.id)!.bold).toBe(false);
        const off = toggleBold(on, node.id);
        expect(off.find((n) => n.id === node.id)!.bold).toBe(false);
    });
});

// ─── childrenOf ─────────────────────────────────────────────────────────────

describe("childrenOf", () => {
    it("returns children of a node sorted by row ascending", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: "root", row: 2 }),
            makeNode({ id: "b", parentId: "root", row: 0 }),
            makeNode({ id: "c", parentId: "root", row: 1 }),
        ];
        const result = childrenOf(nodes, "root", "sheet1");
        expect(result.map((n) => n.id)).toEqual(["b", "c", "a"]);
    });

    it("excludes nodes with different parentId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: "root", row: 0 }),
            makeNode({ id: "b", parentId: "other", row: 0 }),
        ];
        const result = childrenOf(nodes, "root", "sheet1");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("filters by sheetId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                parentId: "root",
                row: 0,
                sheetId: "sheet1",
            }),
            makeNode({
                id: "b",
                parentId: "root",
                row: 1,
                sheetId: "sheet2",
            }),
        ];
        const result = childrenOf(nodes, "root", "sheet1");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("returns empty array when no children exist", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a" })];
        const result = childrenOf(nodes, "nonexistent", "sheet1");
        expect(result).toEqual([]);
    });

    it("does not mutate the input array", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: "root", row: 2 }),
            makeNode({ id: "b", parentId: "root", row: 0 }),
        ];
        const original = [...nodes];
        childrenOf(nodes, "root", "sheet1");
        expect(nodes).toEqual(original);
    });
});

// ─── rootsOf ────────────────────────────────────────────────────────────────

describe("rootsOf", () => {
    it("returns nodes with null parentId for a given sheet and speech, sorted by row", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                parentId: null,
                row: 2,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                parentId: null,
                row: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "c",
                parentId: null,
                row: 1,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
        ];
        const result = rootsOf(nodes, "sheet1", "speech1");
        expect(result.map((n) => n.id)).toEqual(["b", "c", "a"]);
    });

    it("excludes nodes with non-null parentId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: null, row: 0 }),
            makeNode({ id: "b", parentId: "parent", row: 0 }),
        ];
        const result = rootsOf(nodes, "sheet1", "speech1");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("filters by sheetId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                parentId: null,
                row: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                parentId: null,
                row: 0,
                sheetId: "sheet2",
                speechId: "speech1",
            }),
        ];
        const result = rootsOf(nodes, "sheet1", "speech1");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("filters by speechId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                parentId: null,
                row: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                parentId: null,
                row: 0,
                sheetId: "sheet1",
                speechId: "speech2",
            }),
        ];
        const result = rootsOf(nodes, "sheet1", "speech1");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("returns empty array when no roots exist", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: "p" })];
        const result = rootsOf(nodes, "sheet1", "speech1");
        expect(result).toEqual([]);
    });
});

// ─── placeNodeAt ─────────────────────────────────────────────────────────────

describe("placeNodeAt", () => {
    it("creates a node at an exact cell", () => {
        const { nodes, node } = placeNodeAt([], {
            sheetId: "s1",
            speechId: "a",
            parentId: null,
            row: 3,
        });
        expect(node.row).toBe(3);
        expect(node.speechId).toBe("a");
        expect(node.parentId).toBeNull();
        expect(nodes).toHaveLength(1);
    });

    it("creates a node with the provided sheetId, speechId, and parentId", () => {
        const { node } = placeNodeAt([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: "p1",
            row: 0,
        });
        expect(node.sheetId).toBe("sheet1");
        expect(node.speechId).toBe("speech1");
        expect(node.parentId).toBe("p1");
    });

    it("creates a node with empty statuses and null numberOverride", () => {
        const { node } = placeNodeAt([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            row: 0,
        });
        expect(node.statuses).toEqual([]);
        expect(node.numberOverride).toBeNull();
    });

    it("uses empty string for text when not provided", () => {
        const { node } = placeNodeAt([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            row: 0,
        });
        expect(node.text).toBe("");
    });

    it("uses provided text", () => {
        const { node } = placeNodeAt([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            row: 0,
            text: "hello",
        });
        expect(node.text).toBe("hello");
    });

    it('creates a node id prefixed with "node"', () => {
        const { node } = placeNodeAt([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            row: 0,
        });
        expect(node.id).toMatch(/^node_/);
    });

    it("does not mutate the original nodes array", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", row: 0, sheetId: "sheet1", speechId: "speech1" }),
        ];
        const original = [...nodes];
        const originalNode = { ...nodes[0] };
        placeNodeAt(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            row: 1,
        });
        expect(nodes).toEqual(original);
        expect(nodes[0]).toEqual(originalNode);
    });

    it("new nodes array length is original + 1", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a" }), makeNode({ id: "b" })];
        const { nodes: newNodes } = placeNodeAt(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            row: 1,
        });
        expect(newNodes).toHaveLength(3);
    });
});

describe("updateText single-line", () => {
    it("collapses newlines to spaces so cells stay one line", () => {
        const nodes = [
            {
                id: "n1",
                sheetId: "s",
                speechId: "1ac",
                parentId: null,
                row: 0,
                text: "",
                statuses: [],
                bold: false,
                numberOverride: null,
            },
        ] as any;
        const out = updateText(nodes, "n1", "tag\ncite\r\nmore");
        expect(out[0].text).toBe("tag cite more");
    });
});

// ─── orphanNode ──────────────────────────────────────────────────────────────

describe("orphanNode", () => {
    it("removes the node and nulls its children's parentId in place", () => {
        const parent = {
            id: "p",
            sheetId: "s1",
            speechId: "a",
            parentId: null,
            row: 0,
            text: "p",
            statuses: [],
            bold: false,
            numberOverride: null,
        };
        const child = { ...parent, id: "c", speechId: "b", parentId: "p", row: 0 };
        const out = orphanNode([parent, child], "p");
        expect(out.find((n) => n.id === "p")).toBeUndefined();
        const c = out.find((n) => n.id === "c")!;
        expect(c.parentId).toBeNull();
        expect(c.row).toBe(0); // coordinate preserved
    });

    it("re-parents direct children to null when removed node was a root", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "root", parentId: null }),
            makeNode({ id: "child", parentId: "root" }),
        ];
        const result = orphanNode(nodes, "root");
        expect(result.find((n) => n.id === "child")!.parentId).toBeNull();
    });

    it("handles removing a leaf node (no children)", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a" }), makeNode({ id: "b" })];
        const result = orphanNode(nodes, "b");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });
});

// ─── deleteSubtree ───────────────────────────────────────────────────────────

describe("deleteSubtree", () => {
    it("removes the node and all descendants", () => {
        const base = {
            sheetId: "s1",
            parentId: null,
            row: 0,
            text: "",
            statuses: [],
            bold: false,
            numberOverride: null,
        };
        const nodes: ArgumentNode[] = [
            { ...base, id: "root", speechId: "a" },
            { ...base, id: "c", speechId: "b", parentId: "root" },
            { ...base, id: "gc", speechId: "c", parentId: "c" },
            { ...base, id: "keep", speechId: "a", row: 1 },
        ];
        const out = deleteSubtree(nodes, "root");
        expect(out.map((n) => n.id)).toEqual(["keep"]);
    });
});

// ─── setParent ───────────────────────────────────────────────────────────────

describe("setParent", () => {
    it("updates the parentId of the target node", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: null })];
        const result = setParent(nodes, "a", "newParent");
        expect(result.find((n) => n.id === "a")!.parentId).toBe("newParent");
    });

    it("can set parentId to null", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: "oldParent" })];
        const result = setParent(nodes, "a", null);
        expect(result.find((n) => n.id === "a")!.parentId).toBeNull();
    });

    it("resets numberOverride to null", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: null, numberOverride: 5 })];
        const result = setParent(nodes, "a", "p");
        expect(result.find((n) => n.id === "a")!.numberOverride).toBeNull();
    });

    it("does not mutate original nodes", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: null })];
        const originalParentId = nodes[0].parentId;
        setParent(nodes, "a", "newParent");
        expect(nodes[0].parentId).toBe(originalParentId);
    });

    it("leaves other nodes untouched", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: null }),
            makeNode({ id: "b", parentId: null }),
        ];
        const result = setParent(nodes, "a", "p");
        expect(result.find((n) => n.id === "b")!.parentId).toBeNull();
    });
});

// ─── updateText ──────────────────────────────────────────────────────────────

describe("updateText", () => {
    it("updates the text of the target node", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", text: "old" })];
        const result = updateText(nodes, "a", "new text");
        expect(result.find((n) => n.id === "a")!.text).toBe("new text");
    });

    it("does not mutate original nodes", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", text: "old" })];
        updateText(nodes, "a", "new");
        expect(nodes[0].text).toBe("old");
    });

    it("leaves other nodes untouched", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", text: "hello" }),
            makeNode({ id: "b", text: "world" }),
        ];
        const result = updateText(nodes, "a", "changed");
        expect(result.find((n) => n.id === "b")!.text).toBe("world");
    });
});

// ─── toggleStatus ─────────────────────────────────────────────────────────────

describe("toggleStatus", () => {
    it("adds a status when not present", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", statuses: [] })];
        const result = toggleStatus(nodes, "a", "conceded");
        expect(result.find((n) => n.id === "a")!.statuses).toContain("conceded");
    });

    it("removes a status when already present", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", statuses: ["conceded"] })];
        const result = toggleStatus(nodes, "a", "conceded");
        expect(result.find((n) => n.id === "a")!.statuses).not.toContain("conceded");
    });

    it("does not affect other statuses when removing", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", statuses: ["conceded", "extended"] })];
        const result = toggleStatus(nodes, "a", "conceded");
        expect(result.find((n) => n.id === "a")!.statuses).toContain("extended");
    });

    it("does not mutate the original node statuses array", () => {
        const statuses: NodeStatus[] = ["conceded"];
        const nodes: ArgumentNode[] = [makeNode({ id: "a", statuses })];
        toggleStatus(nodes, "a", "conceded");
        expect(statuses).toEqual(["conceded"]);
    });

    it("can add extended status", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", statuses: [] })];
        const result = toggleStatus(nodes, "a", "extended");
        expect(result.find((n) => n.id === "a")!.statuses).toContain("extended");
    });
});
