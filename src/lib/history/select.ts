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
 *
 * Depth encodes *branches*, not chain length: a node's oldest child continues the
 * current line at the same depth, and only the younger, diverging children indent
 * (once each). A straight run of edits therefore stays flush-left instead of
 * marching off the right edge of the panel.
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
        children.forEach((child, i) => visit(child.id, i === 0 ? depth : depth + 1));
    };

    visit(tree.rootId, 0);
    return rows;
}
