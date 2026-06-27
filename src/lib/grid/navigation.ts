/**
 * Node-centric navigation helpers.
 *
 * These operate directly on the flat `ArgumentNode[]` array (NOT on the
 * FlowGrid rowspan layout). They are pure: no mutation, no store access.
 */

import type { PlacedNode } from "@/lib/grid/layout";
import type { ArgumentNode, Format, Speech } from "@/lib/model/types";

/** Returns the parent node of nodeId, or null. */
export function parentOf(nodes: ArgumentNode[], nodeId: string): ArgumentNode | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.parentId === null) return null;
    return nodes.find((n) => n.id === node.parentId) ?? null;
}

/**
 * Returns the child with minimum order among all nodes whose
 * parentId === nodeId and sheetId === sheetId. Children may span speeches,
 * so this does not filter by speechId.
 */
export function firstChildOf(
    nodes: ArgumentNode[],
    nodeId: string,
    sheetId: string,
): ArgumentNode | null {
    const children = nodes.filter((n) => n.parentId === nodeId && n.sheetId === sheetId);
    if (children.length === 0) return null;
    return children.reduce((best, n) => (n.row < best.row ? n : best));
}

/**
 * Returns the node with the next-lower order in the same (sheetId, speechId)
 * column as `node`, or null if `node` is at the top.
 */
export function nodeAboveInColumn(nodes: ArgumentNode[], node: ArgumentNode): ArgumentNode | null {
    const above = nodes.filter(
        (n) => n.sheetId === node.sheetId && n.speechId === node.speechId && n.row < node.row,
    );
    if (above.length === 0) return null;
    return above.reduce((best, n) => (n.row > best.row ? n : best));
}

/**
 * Returns the node with the next-higher order in the same (sheetId, speechId)
 * column as `node`, or null if `node` is at the bottom.
 */
export function nodeBelowInColumn(nodes: ArgumentNode[], node: ArgumentNode): ArgumentNode | null {
    const below = nodes.filter(
        (n) => n.sheetId === node.sheetId && n.speechId === node.speechId && n.row > node.row,
    );
    if (below.length === 0) return null;
    return below.reduce((best, n) => (n.row < best.row ? n : best));
}

/**
 * Given a format and a speechId, returns the first speech after speechId that
 * belongs to the opposite side, or null.
 */
export function nextOpposingSpeech(format: Format, speechId: string): Speech | null {
    const index = format.speeches.findIndex((s) => s.id === speechId);
    if (index === -1) return null;
    const side = format.speeches[index].side;
    for (let i = index + 1; i < format.speeches.length; i++) {
        if (format.speeches[i].side !== side) return format.speeches[i];
    }
    return null;
}

/**
 * Returns the placed node physically above/below `nodeId` in the SAME column,
 * by screen row (`startRow`) — the true visual neighbor across band boundaries.
 * Null at the column's vertical edge. Never crosses columns.
 */
export function adjacentInColumn(
    placed: PlacedNode[],
    nodeId: string,
    dir: "up" | "down",
): ArgumentNode | null {
    const cur = placed.find((p) => p.node.id === nodeId);
    if (!cur) return null;
    const sameCol = placed.filter((p) => p.col === cur.col && p.node.id !== nodeId);
    if (dir === "up") {
        const above = sameCol.filter((p) => p.startRow < cur.startRow);
        if (above.length === 0) return null;
        return above.reduce((best, p) => (p.startRow > best.startRow ? p : best)).node;
    }
    const below = sameCol.filter((p) => p.startRow > cur.startRow);
    if (below.length === 0) return null;
    return below.reduce((best, p) => (p.startRow < best.startRow ? p : best)).node;
}
