import { describe, it, expect } from "vitest";

import type { Round } from "@/lib/model/types";

import { flattenForPanel } from "./select";
import { createTree, commit, undo, jumpTo } from "./tree";

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
        // Indentation encodes branches, not chain length: the oldest child stays
        // at its parent's depth; only the younger, diverging branch indents.
        expect(rows.map((r) => r.node.id)).toEqual([tree.rootId, a, b]);
        expect(rows.map((r) => r.depth)).toEqual([0, 0, 1]);

        const current = rows.find((r) => r.isCurrent)!;
        expect(current.node.id).toBe(b);

        const onPath = rows.filter((r) => r.isOnCurrentPath).map((r) => r.node.id);
        expect(new Set(onPath)).toEqual(new Set([tree.rootId, b]));
    });

    it("keeps a linear history flush-left (no per-edit indentation)", () => {
        let tree = createTree(makeRound(), "Start");
        tree = commit(tree, makeRound(2), null, "A");
        tree = commit(tree, makeRound(3), null, "B");
        tree = commit(tree, makeRound(4), null, "C");

        const rows = flattenForPanel(tree);

        // A straight chain of edits never nests — it would otherwise march off
        // the right edge of the panel.
        expect(rows.map((r) => r.node.label)).toEqual(["Start", "A", "B", "C"]);
        expect(rows.map((r) => r.depth)).toEqual([0, 0, 0, 0]);
    });

    it("indents each diverging branch once, and its descendants stay at that indent", () => {
        // root ─ A ─ B          (mainline, oldest children)
        //         └ C ─ D       (branch off A: C is A's younger child)
        let tree = createTree(makeRound(), "root");
        tree = commit(tree, makeRound(2), null, "A");
        const a = tree.currentId;
        tree = commit(tree, makeRound(3), null, "B"); // A's oldest child
        tree = jumpTo(tree, a);
        tree = commit(tree, makeRound(4), null, "C"); // A's younger child (branch)
        tree = commit(tree, makeRound(5), null, "D"); // C's oldest child

        const byLabel = new Map(
            flattenForPanel(tree).map((r) => [r.node.label, r.depth] as const),
        );

        expect(byLabel.get("root")).toBe(0);
        expect(byLabel.get("A")).toBe(0);
        expect(byLabel.get("B")).toBe(0); // oldest child stays on the mainline
        expect(byLabel.get("C")).toBe(1); // branch indents once
        expect(byLabel.get("D")).toBe(1); // its descendants stay at the branch indent
    });
});
