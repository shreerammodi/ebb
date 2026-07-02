import { describe, it, expect } from "vitest";

import type { Round } from "@/lib/model/types";

import { createTree, currentRound, commit } from "./tree";

/** Minimal Round factory; only fields the tree cares about matter here. */
function makeRound(id = "round_1", overrides: Partial<Round> = {}): Round {
    return {
        id,
        createdAt: 1,
        updatedAt: 1,
        role: "aff",
        format: { id: "f", name: "F", speeches: [], prepSeconds: { aff: 0, neg: 0 } },
        scouting: {
            aff: { first: { first: "", last: "" }, second: { first: "", last: "" } },
            neg: { first: { first: "", last: "" }, second: { first: "", last: "" } },
        },
        sheets: [],
        nodes: [],
        groups: [],
        ...overrides,
    };
}

describe("createTree", () => {
    it("creates a single root node that is the current node", () => {
        const round = makeRound();
        const tree = createTree(round, "New round");

        expect(tree.rootId).toBe(tree.currentId);
        expect(Object.keys(tree.nodes)).toHaveLength(1);

        const root = tree.nodes[tree.rootId];
        expect(root.parentId).toBeNull();
        expect(root.childIds).toEqual([]);
        expect(root.snapshot).toBe(round);
        expect(root.label).toBe("New round");
        expect(root.coalesceKey).toBeNull();
    });

    it("currentRound returns the current node's snapshot", () => {
        const round = makeRound();
        const tree = createTree(round);
        expect(currentRound(tree)).toBe(round);
    });
});

describe("commit", () => {
    it("branches: a new-key commit appends a child and moves current", () => {
        const r0 = makeRound("round_1");
        const r1 = makeRound("round_1", { updatedAt: 2 });
        let tree = createTree(r0);
        const rootId = tree.rootId;

        tree = commit(tree, r1, null, "Type");

        expect(tree.currentId).not.toBe(rootId);
        expect(tree.nodes[rootId].childIds).toEqual([tree.currentId]);
        expect(tree.nodes[tree.currentId].parentId).toBe(rootId);
        expect(currentRound(tree)).toBe(r1);
        expect(tree.nodes[tree.currentId].label).toBe("Type");
        expect(Object.keys(tree.nodes)).toHaveLength(2);
    });

    it("coalesces: same-key commit replaces the current snapshot in place", () => {
        const r0 = makeRound("round_1");
        const r1 = makeRound("round_1", { updatedAt: 2 });
        const r2 = makeRound("round_1", { updatedAt: 3 });
        let tree = createTree(r0);

        tree = commit(tree, r1, "text:n1", "Type");
        const afterFirst = tree.currentId;
        tree = commit(tree, r2, "text:n1", "Type");

        expect(tree.currentId).toBe(afterFirst); // no new node
        expect(Object.keys(tree.nodes)).toHaveLength(2); // root + one
        expect(currentRound(tree)).toBe(r2);
    });

    it("does not coalesce across different keys", () => {
        const r0 = makeRound("round_1");
        let tree = createTree(r0);
        tree = commit(tree, makeRound("round_1", { updatedAt: 2 }), "text:n1", "Type");
        tree = commit(tree, makeRound("round_1", { updatedAt: 3 }), "text:n2", "Type");
        expect(Object.keys(tree.nodes)).toHaveLength(3);
    });

    it("branch-after-undo keeps the old branch", () => {
        const r0 = makeRound("round_1");
        let tree = createTree(r0);
        tree = commit(tree, makeRound("round_1", { updatedAt: 2 }), null, "A");
        const branchA = tree.currentId;
        // simulate an undo back to root, then a divergent edit
        tree = { ...tree, currentId: tree.rootId };
        tree = commit(tree, makeRound("round_1", { updatedAt: 3 }), null, "B");
        const branchB = tree.currentId;

        expect(branchA).not.toBe(branchB);
        expect(tree.nodes[tree.rootId].childIds).toEqual([branchA, branchB]);
        expect(tree.nodes[branchA]).toBeDefined(); // old branch preserved
    });
});
