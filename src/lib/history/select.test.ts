import { describe, it, expect } from "vitest";

import type { Round } from "@/lib/model/types";

import { flattenForPanel } from "./select";
import { createTree, commit, undo } from "./tree";

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

describe("flattenForPanel", () => {
    it("returns a depth-first, seq-ordered list with annotations", () => {
        let tree = createTree(makeRound(), "Start");
        tree = commit(tree, makeRound(2), null, "A");
        const a = tree.currentId;
        tree = undo(tree); // back to root
        tree = commit(tree, makeRound(3), null, "B"); // second branch off root
        const b = tree.currentId;

        const rows = flattenForPanel(tree);

        // root, then branch A (older child), then branch B (newer child).
        expect(rows.map((r) => r.node.id)).toEqual([tree.rootId, a, b]);
        expect(rows.map((r) => r.depth)).toEqual([0, 1, 1]);

        const current = rows.find((r) => r.isCurrent)!;
        expect(current.node.id).toBe(b);

        const onPath = rows.filter((r) => r.isOnCurrentPath).map((r) => r.node.id);
        expect(new Set(onPath)).toEqual(new Set([tree.rootId, b]));
    });
});
