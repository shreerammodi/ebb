import { describe, it, expect } from "vitest";
import type { ArgumentNode, NodeStatus } from "@/lib/model/types";
import {
    childrenOf,
    rootsOf,
    addNode,
    setParent,
    updateText,
    toggleStatus,
    toggleBold,
    removeNode,
    moveNode,
    rehomeNode,
} from "@/lib/model/tree";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(
    overrides: Partial<ArgumentNode> & { id: string },
): ArgumentNode {
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

// ─── bold ─────────────────────────────────────────────────────────────────────

describe("bold", () => {
    it("addNode defaults bold to false", () => {
        const { node } = addNode([], {
            sheetId: "s1",
            speechId: "1ac",
            parentId: null,
        });
        expect(node.bold).toBe(false);
    });

    it("toggleBold flips bold and is pure", () => {
        const { nodes, node } = addNode([], {
            sheetId: "s1",
            speechId: "1ac",
            parentId: null,
        });
        const on = toggleBold(nodes, node.id);
        expect(on.find((n) => n.id === node.id)!.bold).toBe(true);
        expect(nodes.find((n) => n.id === node.id)!.bold).toBe(false);
        const off = toggleBold(on, node.id);
        expect(off.find((n) => n.id === node.id)!.bold).toBe(false);
    });
});

describe("rehomeNode", () => {
    it("rehomeNode moves a node to a new column as a root", () => {
        const a = addNode([], {
            sheetId: "s",
            speechId: "1ac",
            parentId: null,
        });
        const b = addNode(a.nodes, {
            sheetId: "s",
            speechId: "1ac",
            parentId: a.node.id,
        });
        const moved = rehomeNode(b.nodes, b.node.id, "2ac", null);
        const n = moved.find((x) => x.id === b.node.id)!;
        expect(n.speechId).toBe("2ac");
        expect(n.parentId).toBeNull();
    });
});

// ─── childrenOf ─────────────────────────────────────────────────────────────

describe("childrenOf", () => {
    it("returns children of a node sorted by order ascending", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: "root", order: 2 }),
            makeNode({ id: "b", parentId: "root", order: 0 }),
            makeNode({ id: "c", parentId: "root", order: 1 }),
        ];
        const result = childrenOf(nodes, "root", "sheet1");
        expect(result.map((n) => n.id)).toEqual(["b", "c", "a"]);
    });

    it("excludes nodes with different parentId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: "root", order: 0 }),
            makeNode({ id: "b", parentId: "other", order: 0 }),
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
                order: 0,
                sheetId: "sheet1",
            }),
            makeNode({
                id: "b",
                parentId: "root",
                order: 1,
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
            makeNode({ id: "a", parentId: "root", order: 2 }),
            makeNode({ id: "b", parentId: "root", order: 0 }),
        ];
        const original = [...nodes];
        childrenOf(nodes, "root", "sheet1");
        expect(nodes).toEqual(original);
    });
});

// ─── rootsOf ────────────────────────────────────────────────────────────────

describe("rootsOf", () => {
    it("returns nodes with null parentId for a given sheet and speech, sorted by order", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                parentId: null,
                order: 2,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                parentId: null,
                order: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "c",
                parentId: null,
                order: 1,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
        ];
        const result = rootsOf(nodes, "sheet1", "speech1");
        expect(result.map((n) => n.id)).toEqual(["b", "c", "a"]);
    });

    it("excludes nodes with non-null parentId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: null, order: 0 }),
            makeNode({ id: "b", parentId: "parent", order: 0 }),
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
                order: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                parentId: null,
                order: 0,
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
                order: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                parentId: null,
                order: 0,
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

// ─── addNode ─────────────────────────────────────────────────────────────────

describe("addNode", () => {
    it("returns the new node in the returned nodes array", () => {
        const nodes: ArgumentNode[] = [];
        const { nodes: newNodes, node } = addNode(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(newNodes).toContain(node);
    });

    it("creates a node with the provided sheetId, speechId, and parentId", () => {
        const { node } = addNode([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: "p1",
        });
        expect(node.sheetId).toBe("sheet1");
        expect(node.speechId).toBe("speech1");
        expect(node.parentId).toBe("p1");
    });

    it("creates a node with empty statuses and null numberOverride", () => {
        const { node } = addNode([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(node.statuses).toEqual([]);
        expect(
            node.numberOverride === null || node.numberOverride === undefined,
        ).toBe(true);
    });

    it("uses empty string for text when not provided", () => {
        const { node } = addNode([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(node.text).toBe("");
    });

    it("uses provided text", () => {
        const { node } = addNode([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
            text: "hello",
        });
        expect(node.text).toBe("hello");
    });

    it("assigns order 0 when no existing nodes in same column", () => {
        const { node } = addNode([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(node.order).toBe(0);
    });

    it("assigns order = maxOrder + 1 within same sheet+speech column", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                order: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "b",
                order: 3,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
            makeNode({
                id: "c",
                order: 1,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
        ];
        const { node } = addNode(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(node.order).toBe(4);
    });

    it("does not count nodes from other sheets when computing root order", () => {
        // Roots order sheet-wide: a root on the same sheet (even a different speech)
        // counts, but roots on other sheets do not.
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                order: 99,
                sheetId: "sheet2",
                speechId: "speech1",
                parentId: null,
            }),
            makeNode({
                id: "b",
                order: 50,
                sheetId: "sheet1",
                speechId: "speech2",
                parentId: null,
            }),
        ];
        const { node } = addNode(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        // sheet2 root (a) is excluded; sheet1 root (b, order 50) counts → 51.
        expect(node.order).toBe(51);
    });

    it('creates a node id prefixed with "node"', () => {
        const { node } = addNode([], {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(node.id).toMatch(/^node_/);
    });

    it("does not mutate the original nodes array", () => {
        const nodes: ArgumentNode[] = [
            makeNode({
                id: "a",
                order: 0,
                sheetId: "sheet1",
                speechId: "speech1",
            }),
        ];
        const original = [...nodes];
        const originalNode = { ...nodes[0] };
        addNode(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(nodes).toEqual(original);
        expect(nodes[0]).toEqual(originalNode);
    });

    it("new nodes array length is original + 1", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a" }),
            makeNode({ id: "b" }),
        ];
        const { nodes: newNodes } = addNode(nodes, {
            sheetId: "sheet1",
            speechId: "speech1",
            parentId: null,
        });
        expect(newNodes).toHaveLength(3);
    });
});

describe("addNode root ordering (sheet-wide)", () => {
    it("orders roots across the whole sheet, not per column", () => {
        let nodes: ArgumentNode[] = [];
        const a = addNode(nodes, {
            sheetId: "s",
            speechId: "1ac",
            parentId: null,
        });
        nodes = a.nodes;
        const b = addNode(nodes, {
            sheetId: "s",
            speechId: "1nc",
            parentId: null,
        });
        nodes = b.nodes;
        expect(a.node.order).toBe(0);
        expect(b.node.order).toBe(1); // sheet-wide, not 0 again for a new column
    });

    it("still orders children within their own column", () => {
        let nodes: ArgumentNode[] = [];
        const root = addNode(nodes, {
            sheetId: "s",
            speechId: "1ac",
            parentId: null,
        });
        nodes = root.nodes;
        const c1 = addNode(nodes, {
            sheetId: "s",
            speechId: "1nc",
            parentId: root.node.id,
        });
        nodes = c1.nodes;
        const c2 = addNode(nodes, {
            sheetId: "s",
            speechId: "1nc",
            parentId: root.node.id,
        });
        expect(c1.node.order).toBe(0);
        expect(c2.node.order).toBe(1);
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
                order: 0,
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

// ─── setParent ───────────────────────────────────────────────────────────────

describe("setParent", () => {
    it("updates the parentId of the target node", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", parentId: null })];
        const result = setParent(nodes, "a", "newParent");
        expect(result.find((n) => n.id === "a")!.parentId).toBe("newParent");
    });

    it("can set parentId to null", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: "oldParent" }),
        ];
        const result = setParent(nodes, "a", null);
        expect(result.find((n) => n.id === "a")!.parentId).toBeNull();
    });

    it("resets numberOverride to null", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", parentId: null, numberOverride: 5 }),
        ];
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
        expect(result.find((n) => n.id === "a")!.statuses).toContain(
            "conceded",
        );
    });

    it("removes a status when already present", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", statuses: ["conceded"] }),
        ];
        const result = toggleStatus(nodes, "a", "conceded");
        expect(result.find((n) => n.id === "a")!.statuses).not.toContain(
            "conceded",
        );
    });

    it("does not affect other statuses when removing", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", statuses: ["conceded", "extended"] }),
        ];
        const result = toggleStatus(nodes, "a", "conceded");
        expect(result.find((n) => n.id === "a")!.statuses).toContain(
            "extended",
        );
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
        expect(result.find((n) => n.id === "a")!.statuses).toContain(
            "extended",
        );
    });
});

// ─── removeNode ──────────────────────────────────────────────────────────────

describe("removeNode", () => {
    it("removes the target node from the array", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a" }),
            makeNode({ id: "b" }),
        ];
        const result = removeNode(nodes, "a");
        expect(result.find((n) => n.id === "a")).toBeUndefined();
    });

    it("re-parents direct children to the removed node's parentId", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "grandparent", parentId: null }),
            makeNode({ id: "parent", parentId: "grandparent" }),
            makeNode({ id: "child1", parentId: "parent" }),
            makeNode({ id: "child2", parentId: "parent" }),
        ];
        const result = removeNode(nodes, "parent");
        expect(result.find((n) => n.id === "child1")!.parentId).toBe(
            "grandparent",
        );
        expect(result.find((n) => n.id === "child2")!.parentId).toBe(
            "grandparent",
        );
    });

    it("re-parents direct children to null when removed node was a root", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "root", parentId: null }),
            makeNode({ id: "child", parentId: "root" }),
        ];
        const result = removeNode(nodes, "root");
        expect(result.find((n) => n.id === "child")!.parentId).toBeNull();
    });

    it("does not touch grandchildren (they still point to their direct parents)", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "grandparent", parentId: null }),
            makeNode({ id: "parent", parentId: "grandparent" }),
            makeNode({ id: "child", parentId: "parent" }),
            makeNode({ id: "grandchild", parentId: "child" }),
        ];
        const result = removeNode(nodes, "parent");
        // child is re-parented to grandparent
        expect(result.find((n) => n.id === "child")!.parentId).toBe(
            "grandparent",
        );
        // grandchild still points to child
        expect(result.find((n) => n.id === "grandchild")!.parentId).toBe(
            "child",
        );
    });

    it("does not mutate original nodes array", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a" }),
            makeNode({ id: "b", parentId: "a" }),
        ];
        const originalLength = nodes.length;
        const originalChildParent = nodes[1].parentId;
        removeNode(nodes, "a");
        expect(nodes).toHaveLength(originalLength);
        expect(nodes[1].parentId).toBe(originalChildParent);
    });

    it("handles removing a leaf node (no children)", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a" }),
            makeNode({ id: "b" }),
        ];
        const result = removeNode(nodes, "b");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });
});

// ─── moveNode ────────────────────────────────────────────────────────────────

describe("moveNode", () => {
    it("sets the order of the target node to newOrder", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", order: 0 })];
        const result = moveNode(nodes, "a", 5);
        expect(result.find((n) => n.id === "a")!.order).toBe(5);
    });

    it("does not affect other nodes' order", () => {
        const nodes: ArgumentNode[] = [
            makeNode({ id: "a", order: 0 }),
            makeNode({ id: "b", order: 1 }),
        ];
        const result = moveNode(nodes, "a", 10);
        expect(result.find((n) => n.id === "b")!.order).toBe(1);
    });

    it("does not mutate original nodes", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", order: 0 })];
        moveNode(nodes, "a", 5);
        expect(nodes[0].order).toBe(0);
    });

    it("can move to order 0", () => {
        const nodes: ArgumentNode[] = [makeNode({ id: "a", order: 3 })];
        const result = moveNode(nodes, "a", 0);
        expect(result.find((n) => n.id === "a")!.order).toBe(0);
    });
});
