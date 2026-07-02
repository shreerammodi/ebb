import type { Round } from "@/lib/model/types";

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
 * e.g. typing). Otherwise a new child of the current node is appended and made
 * current — any existing children (a previously-undone branch) are retained.
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
                [current.id]: { ...current, snapshot: nextRound, label },
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
    return {
        ...tree,
        nodes: {
            ...tree.nodes,
            [current.id]: { ...current, childIds: [...current.childIds, id] },
            [id]: node,
        },
        currentId: id,
        seq: tree.seq + 1,
    };
}
