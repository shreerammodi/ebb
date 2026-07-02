import { ancestorChain } from "./tree";
import type { HistoryNode, HistoryTree } from "./types";

export interface PanelRow {
    node: HistoryNode;
    depth: number;
    isCurrent: boolean;
    isOnCurrentPath: boolean;
}

/**
 * Flatten the tree for rendering: depth-first from the root, children ordered by
 * createdSeq, each row annotated with depth, current-ness, and whether it lies on
 * the root→current path.
 */
export function flattenForPanel(tree: HistoryTree): PanelRow[] {
    const onPath = ancestorChain(tree.nodes, tree.currentId);
    const rows: PanelRow[] = [];

    const visit = (id: string, depth: number) => {
        const node = tree.nodes[id];
        rows.push({
            node,
            depth,
            isCurrent: id === tree.currentId,
            isOnCurrentPath: onPath.has(id),
        });
        const children: HistoryNode[] = node.childIds
            .map((c) => tree.nodes[c])
            .sort((a, b) => a.createdSeq - b.createdSeq);
        for (const child of children) visit(child.id, depth + 1);
    };

    visit(tree.rootId, 0);
    return rows;
}
