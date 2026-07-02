import { ancestorChain } from "./tree";
import type { HistoryNode, HistoryTree } from "./types";

/** Maximum nodes retained per flow before old leaves are pruned. */
export const MAX_HISTORY_NODES = 200;

/**
 * Drop the oldest prunable leaves until the tree is within `MAX_HISTORY_NODES`.
 * A leaf is prunable when it has no children and is neither the current node nor
 * an ancestor of it, so undo back to the root always works. Returns the same
 * reference when nothing is pruned.
 */
export function pruneToCap(tree: HistoryTree): HistoryTree {
    if (Object.keys(tree.nodes).length <= MAX_HISTORY_NODES) return tree;

    const protectedIds = ancestorChain(tree.nodes, tree.currentId);
    let nodes = tree.nodes;
    let changed = false;

    while (Object.keys(nodes).length > MAX_HISTORY_NODES) {
        const victim = oldestPrunableLeaf(nodes, protectedIds);
        if (!victim) break;
        nodes = removeLeaf(nodes, victim);
        changed = true;
    }

    return changed ? { ...tree, nodes } : tree;
}

function oldestPrunableLeaf(
    nodes: Record<string, HistoryNode>,
    protectedIds: Set<string>,
): HistoryNode | null {
    let oldest: HistoryNode | null = null;
    for (const node of Object.values(nodes)) {
        if (node.childIds.length > 0) continue;
        if (protectedIds.has(node.id)) continue;
        if (oldest === null || node.createdSeq < oldest.createdSeq) oldest = node;
    }
    return oldest;
}

function removeLeaf(
    nodes: Record<string, HistoryNode>,
    leaf: HistoryNode,
): Record<string, HistoryNode> {
    const next: Record<string, HistoryNode> = {};
    for (const node of Object.values(nodes)) {
        if (node.id === leaf.id) continue;
        if (node.id === leaf.parentId) {
            next[node.id] = {
                ...node,
                childIds: node.childIds.filter((c) => c !== leaf.id),
            };
        } else {
            next[node.id] = node;
        }
    }
    return next;
}
