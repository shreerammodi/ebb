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
