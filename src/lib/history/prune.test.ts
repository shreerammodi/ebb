import { describe, it, expect } from "vitest";

import type { Round } from "@/lib/model/types";

import { MAX_HISTORY_NODES, pruneToCap } from "./prune";
import { createTree, commit, undo, ancestorChain } from "./tree";

function makeRound(updatedAt = 1): Round {
    return {
        id: "r",
        createdAt: 1,
        updatedAt,
        role: "aff",
        format: { id: "f", name: "F", speeches: [], prepSeconds: { aff: 0, neg: 0 } },
        scouting: {
            aff: { first: { first: "", last: "" }, second: { first: "", last: "" } },
            neg: { first: { first: "", last: "" }, second: { first: "", last: "" } },
        },
        sheets: [],
        nodes: [],
        groups: [],
    };
}

describe("pruneToCap", () => {
    it("returns the same reference when under the cap", () => {
        const tree = createTree(makeRound());
        expect(pruneToCap(tree)).toBe(tree);
    });

    it("bounds branching growth by pruning off-path leaves", () => {
        // Per the design, only off-path leaves are prunable. Spawn many sibling
        // branches off the root: each new leaf is current (protected) while the
        // prior siblings become prunable, so the tree stays within the cap.
        let tree = createTree(makeRound());
        const root = tree.rootId;
        for (let i = 0; i < MAX_HISTORY_NODES + 25; i++) {
            tree = { ...tree, currentId: root };
            tree = commit(tree, makeRound(i + 2), null, "edit");
        }
        expect(Object.keys(tree.nodes).length).toBeLessThanOrEqual(MAX_HISTORY_NODES);
    });

    it("never prunes the current node or its ancestors, even past the cap", () => {
        // A purely linear chain is entirely ancestors-of-current, so nothing is
        // prunable: the design guarantees undo back to the root always works.
        let tree = createTree(makeRound());
        for (let i = 0; i < MAX_HISTORY_NODES + 25; i++) {
            tree = commit(tree, makeRound(i + 2), null, "edit");
        }
        // Walk the whole retained chain from current to root; it must be intact.
        const chain = ancestorChain(tree.nodes, tree.currentId);
        for (const id of chain) expect(tree.nodes[id]).toBeDefined();
        // Undo all the way down must still reach the root.
        let walk = tree;
        while (walk.nodes[walk.currentId].parentId !== null) walk = undo(walk);
        expect(walk.currentId).toBe(walk.rootId);
    });
});
