/**
 * Pure clash-tree operations.
 *
 * All functions are pure: they take an array of ArgumentNode and return
 * new arrays without mutating their input.
 */

import type { ArgumentNode, NodeStatus } from "@/lib/model/types";
import { uid } from "@/lib/model/ids";

/**
 * Returns children of a node (nodes whose parentId === parentId and
 * sheetId === sheetId), sorted ascending by order.
 */
export function childrenOf(
    nodes: ArgumentNode[],
    parentId: string,
    sheetId: string,
): ArgumentNode[] {
    return nodes
        .filter((n) => n.parentId === parentId && n.sheetId === sheetId)
        .sort((a, b) => a.order - b.order);
}

/**
 * Returns root-level nodes (parentId === null) for the given sheet and speech,
 * sorted ascending by order.
 */
export function rootsOf(
    nodes: ArgumentNode[],
    sheetId: string,
    speechId: string,
): ArgumentNode[] {
    return nodes
        .filter(
            (n) =>
                n.parentId === null &&
                n.sheetId === sheetId &&
                n.speechId === speechId,
        )
        .sort((a, b) => a.order - b.order);
}

/**
 * Creates a new ArgumentNode and returns the updated nodes array alongside
 * the created node.
 *
 * If `insertAfterOrder` is provided, the new node is inserted immediately after
 * that position and all nodes in the same column with a higher order are shifted
 * up by one. Otherwise the node is appended at the end of the column.
 */
export function addNode(
    nodes: ArgumentNode[],
    input: {
        sheetId: string;
        speechId: string;
        parentId: string | null;
        text?: string;
        insertAfterOrder?: number;
    },
): { nodes: ArgumentNode[]; node: ArgumentNode } {
    const isRoot = input.parentId === null;
    // Roots order against ALL roots on the sheet (roots-anywhere); children order
    // within their own (sheet, speech) column.
    const inScope = (n: ArgumentNode): boolean =>
        isRoot
            ? n.sheetId === input.sheetId && n.parentId === null
            : n.sheetId === input.sheetId && n.speechId === input.speechId;

    const scope = nodes.filter(inScope);

    let newOrder: number;
    let updatedNodes: ArgumentNode[];

    if (input.insertAfterOrder !== undefined) {
        newOrder = input.insertAfterOrder + 1;
        updatedNodes = nodes.map((n) =>
            inScope(n) && n.order >= newOrder
                ? { ...n, order: n.order + 1 }
                : n,
        );
    } else {
        newOrder =
            scope.length > 0 ? Math.max(...scope.map((n) => n.order)) + 1 : 0;
        updatedNodes = [...nodes];
    }

    const node: ArgumentNode = {
        id: uid("node"),
        sheetId: input.sheetId,
        speechId: input.speechId,
        parentId: input.parentId,
        order: newOrder,
        text: input.text ?? "",
        statuses: [],
        bold: false,
        numberOverride: null,
    };

    return { nodes: [...updatedNodes, node], node };
}

/**
 * Returns a new array with the target node's parentId updated and its
 * numberOverride reset to null.
 */
export function setParent(
    nodes: ArgumentNode[],
    nodeId: string,
    parentId: string | null,
): ArgumentNode[] {
    return nodes.map((n) =>
        n.id === nodeId ? { ...n, parentId, numberOverride: null } : n,
    );
}

/**
 * Returns a new array with the target node's text updated.
 */
export function updateText(
    nodes: ArgumentNode[],
    nodeId: string,
    text: string,
): ArgumentNode[] {
    const oneLine = text.replace(/\r?\n|\r/g, " ");
    return nodes.map((n) => (n.id === nodeId ? { ...n, text: oneLine } : n));
}

/**
 * Toggles a status on the target node: adds if absent, removes if present.
 */
export function toggleStatus(
    nodes: ArgumentNode[],
    nodeId: string,
    status: NodeStatus,
): ArgumentNode[] {
    return nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const hasStatus = n.statuses.includes(status);
        const statuses = hasStatus
            ? n.statuses.filter((s) => s !== status)
            : [...n.statuses, status];
        return { ...n, statuses };
    });
}

/**
 * Removes the target node and re-parents its direct children to the removed
 * node's parentId (so sub-answers are not orphaned).
 * Children of children are untouched (they still point at their parents).
 */
export function removeNode(
    nodes: ArgumentNode[],
    nodeId: string,
): ArgumentNode[] {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return [...nodes];

    const grandparentId = target.parentId;

    return nodes
        .filter((n) => n.id !== nodeId)
        .map((n) =>
            n.parentId === nodeId ? { ...n, parentId: grandparentId } : n,
        );
}

/**
 * Sets a node's order to newOrder (simple reorder; no renormalization).
 */
export function moveNode(
    nodes: ArgumentNode[],
    nodeId: string,
    newOrder: number,
): ArgumentNode[] {
    return nodes.map((n) => (n.id === nodeId ? { ...n, order: newOrder } : n));
}

/**
 * Toggles the bold decoration on the target node.
 */
export function toggleBold(
    nodes: ArgumentNode[],
    nodeId: string,
): ArgumentNode[] {
    return nodes.map((n) => (n.id === nodeId ? { ...n, bold: !n.bold } : n));
}

/**
 * Moves a node to a different column (speechId) and parent, appending it at the
 * end of the destination column. Used by drag-to-move.
 */
export function rehomeNode(
    nodes: ArgumentNode[],
    nodeId: string,
    speechId: string,
    parentId: string | null,
): ArgumentNode[] {
    const column = nodes.filter((n) => {
        const target = nodes.find((x) => x.id === nodeId);
        return (
            target &&
            n.sheetId === target.sheetId &&
            n.speechId === speechId &&
            n.id !== nodeId
        );
    });
    const newOrder =
        column.length > 0 ? Math.max(...column.map((n) => n.order)) + 1 : 0;
    return nodes.map((n) =>
        n.id === nodeId ? { ...n, speechId, parentId, order: newOrder } : n,
    );
}
