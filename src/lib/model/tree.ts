/**
 * Pure clash-tree operations.
 *
 * The `parentId` tree is relationship metadata only — it does NOT drive layout.
 * Position lives on the grid via `(speechId, row)`. These helpers create nodes
 * at exact cells and restructure the tree without touching coordinates.
 *
 * All functions are pure: they take an array of ArgumentNode and return new
 * arrays without mutating their input.
 */

import { uid } from "@/lib/model/ids";
import type { ArgumentNode, NodeStatus } from "@/lib/model/types";

/**
 * Creates a new ArgumentNode at an exact cell and returns the updated nodes
 * array alongside the created node. Caller guarantees (speechId, row) is free.
 */
export function placeNodeAt(
    nodes: ArgumentNode[],
    input: {
        sheetId: string;
        speechId: string;
        parentId: string | null;
        row: number;
        text?: string;
        unitId?: string;
    },
): { nodes: ArgumentNode[]; node: ArgumentNode } {
    const node: ArgumentNode = {
        id: uid("node"),
        sheetId: input.sheetId,
        speechId: input.speechId,
        parentId: input.parentId,
        row: input.row,
        text: input.text ?? "",
        statuses: [],
        bold: false,
        highlight: false,
        numberOverride: null,
        ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    };
    return { nodes: [...nodes, node], node };
}

/** Removes a node and every transitive descendant. */
export function deleteSubtree(nodes: ArgumentNode[], rootId: string): ArgumentNode[] {
    const childrenBy = new Map<string, string[]>();
    for (const n of nodes) {
        if (n.parentId === null) continue;
        const arr = childrenBy.get(n.parentId);
        if (arr) arr.push(n.id);
        else childrenBy.set(n.parentId, [n.id]);
    }
    const doomed = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop()!;
        if (doomed.has(id)) continue;
        doomed.add(id);
        for (const c of childrenBy.get(id) ?? []) stack.push(c);
    }
    return nodes.filter((n) => !doomed.has(n.id));
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
    return nodes.map((n) => (n.id === nodeId ? { ...n, parentId, numberOverride: null } : n));
}

/**
 * Returns a new array with the target node's text updated.
 */
export function updateText(nodes: ArgumentNode[], nodeId: string, text: string): ArgumentNode[] {
    const oneLine = text.replace(/\r?\n|\r/g, " ");
    return nodes.map((n) => (n.id === nodeId ? { ...n, text: oneLine } : n));
}

/**
 * Returns a new array with the target node relocated to (speechId, row). Other
 * fields (parentId, statuses, decorations) are preserved. Pure; no-ops for an
 * unknown id. Collision checking is the caller's responsibility.
 */
export function moveNode(
    nodes: ArgumentNode[],
    nodeId: string,
    speechId: string,
    row: number,
): ArgumentNode[] {
    return nodes.map((n) => (n.id === nodeId ? { ...n, speechId, row } : n));
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
 * Toggles the bold decoration on the target node.
 */
export function toggleBold(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    return nodes.map((n) => (n.id === nodeId ? { ...n, bold: !n.bold } : n));
}

/**
 * Toggles the highlight decoration on the target node.
 */
export function toggleHighlight(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    return nodes.map((n) => (n.id === nodeId ? { ...n, highlight: !n.highlight } : n));
}
