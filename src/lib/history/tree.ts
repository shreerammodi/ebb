import type { Round } from "@/lib/model/types";

import { pruneToCap } from "./prune";
import type { HistoryNode, HistoryTree } from "./types";

export type { HistoryNode, HistoryTree } from "./types";

/** A fresh tree with a single root node holding `round` as the current state. */
export function createTree(round: Round, label = "New round"): HistoryTree {
    const rootId = "h0";
    const root: HistoryNode = {
        id: rootId,
        parentId: null,
        childIds: [],
        snapshot: round,
        label,
        coalesceKey: null,
        createdAt: Date.now(),
        createdSeq: 0,
    };
    return { nodes: { [rootId]: root }, rootId, currentId: rootId, seq: 1 };
}

/** The Round snapshot at the current node. */
export function currentRound(tree: HistoryTree): Round {
    return tree.nodes[tree.currentId].snapshot;
}

/**
 * Record `nextRound` in the tree.
 *
 * When `coalesceKey` is non-null and matches the current node's key, the
 * current node's snapshot is replaced in place (one undo step per edit burst,
 * e.g. typing). The node keeps its original label, so a burst that began as
 * "Add" (a new cell absorbing its first keystrokes) stays "Add" rather than
 * being relabeled by the follow-on "Type" commits. Otherwise a new child of the
 * current node is appended and made current — any existing children (a
 * previously-undone branch) are retained.
 */
export function commit(
    tree: HistoryTree,
    nextRound: Round,
    coalesceKey: string | null,
    label: string,
): HistoryTree {
    const current = tree.nodes[tree.currentId];

    if (coalesceKey !== null && current.coalesceKey === coalesceKey) {
        return {
            ...tree,
            nodes: {
                ...tree.nodes,
                [current.id]: { ...current, snapshot: nextRound },
            },
        };
    }

    const id = `h${tree.seq}`;
    const node: HistoryNode = {
        id,
        parentId: current.id,
        childIds: [],
        snapshot: nextRound,
        label,
        coalesceKey,
        createdAt: Date.now(),
        createdSeq: tree.seq,
    };
    return pruneToCap({
        ...tree,
        nodes: {
            ...tree.nodes,
            [current.id]: { ...current, childIds: [...current.childIds, id] },
            [id]: node,
        },
        currentId: id,
        seq: tree.seq + 1,
    });
}

/** Move the current pointer to the parent. No-op at the root. */
export function undo(tree: HistoryTree): HistoryTree {
    const current = tree.nodes[tree.currentId];
    if (current.parentId === null) return tree;
    return { ...tree, currentId: current.parentId };
}

/** Move the current pointer to the most-recently-created child. No-op at a leaf. */
export function redo(tree: HistoryTree): HistoryTree {
    const current = tree.nodes[tree.currentId];
    if (current.childIds.length === 0) return tree;
    const newest = current.childIds
        .map((id) => tree.nodes[id])
        .reduce((a, b) => (b.createdSeq > a.createdSeq ? b : a));
    return { ...tree, currentId: newest.id };
}

/** Point current at any existing node. Unknown ids are a no-op. */
export function jumpTo(tree: HistoryTree, nodeId: string): HistoryTree {
    if (!tree.nodes[nodeId]) return tree;
    if (nodeId === tree.currentId) return tree;
    return { ...tree, currentId: nodeId };
}

/**
 * Clear the current node's coalesceKey so a subsequent same-key commit starts a
 * new node instead of overwriting this one. Called when the cursor moves, so a
 * fresh edit burst is a distinct undo step. No-op if already null.
 */
export function sealCurrent(tree: HistoryTree): HistoryTree {
    const current = tree.nodes[tree.currentId];
    if (current.coalesceKey === null) return tree;
    return {
        ...tree,
        nodes: { ...tree.nodes, [current.id]: { ...current, coalesceKey: null } },
    };
}

/** The given node plus every ancestor up to the root, as a Set of ids. */
export function ancestorChain(nodes: Record<string, HistoryNode>, id: string): Set<string> {
    const chain = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && nodes[cursor]) {
        chain.add(cursor);
        cursor = nodes[cursor].parentId;
    }
    return chain;
}
