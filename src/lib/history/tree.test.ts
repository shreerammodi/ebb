import { describe, it, expect } from "vitest";

import type { Round } from "@/lib/model/types";

import { createTree, currentRound } from "./tree";

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
