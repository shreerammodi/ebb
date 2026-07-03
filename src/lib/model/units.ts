/**
 * Argument units - a unit is a vertical run of same-column cells that
 * together form ONE argument (debaters split a thought across cells).
 *
 * The lowest-row member is the HEAD: it carries the unit's parentId,
 * statuses, and auto number. Continuation cells keep parentId null and are
 * excluded from numbering and tree traversal. `unitId` absent = self-unit,
 * so pre-unit rounds need no migration.
 *
 * Dependency-free by design (types only): grid/coords imports this module,
 * so importing grid helpers back would cycle. The small descendants walk is
 * duplicated here for that reason.
 */

import type { ArgumentNode } from "@/lib/model/types";

/** The unit key: shared `unitId`, or the node's own id for a self-unit. */
export function unitKeyOf(n: ArgumentNode): string {
    return n.unitId ?? n.id;
}

/** Members of the node's unit within its sheet, ascending by row. */
export function unitOf(nodes: ArgumentNode[], node: ArgumentNode): ArgumentNode[] {
    const key = unitKeyOf(node);
    return nodes
        .filter((n) => n.sheetId === node.sheetId && unitKeyOf(n) === key)
        .sort((a, b) => a.row - b.row);
}

/** The unit's head: its lowest-row member. */
export function unitHeadOf(nodes: ArgumentNode[], node: ArgumentNode): ArgumentNode {
    return unitOf(nodes, node)[0] ?? node;
}

export function isUnitHead(nodes: ArgumentNode[], node: ArgumentNode): boolean {
    return unitHeadOf(nodes, node).id === node.id;
}

/** The deepest row occupied by one of the unit's own cells. */
export function lastMemberRow(nodes: ArgumentNode[], node: ArgumentNode): number {
    const members = unitOf(nodes, node);
    return members[members.length - 1]?.row ?? node.row;
}

/** parentId -> children lookup (tree edges only; continuations are not edges). */
function childrenByParent(nodes: ArgumentNode[]): Map<string, ArgumentNode[]> {
    const map = new Map<string, ArgumentNode[]>();
    for (const n of nodes) {
        if (n.parentId === null) continue;
        const arr = map.get(n.parentId);
        if (arr) arr.push(n);
        else map.set(n.parentId, [n]);
    }
    return map;
}

/**
 * The full band a unit owns: its members, their responses, those responses'
 * unit members, and so on. This is the unit-level analog of a subtree -
 * continuation cells are parentId-null, so a plain descendants walk from the
 * head would miss them.
 */
export function unitSubtreeIds(nodes: ArgumentNode[], anyMemberId: string): Set<string> {
    const seed = nodes.find((n) => n.id === anyMemberId);
    const out = new Set<string>();
    if (!seed) return out;
    const byParent = childrenByParent(nodes);
    const queue = unitOf(nodes, seed).map((m) => m.id);
    while (queue.length) {
        const id = queue.pop()!;
        if (out.has(id)) continue;
        out.add(id);
        for (const child of byParent.get(id) ?? []) {
            for (const m of unitOf(nodes, child)) queue.push(m.id);
        }
    }
    return out;
}

/** Deepest grid row spanned by the unit's band (cells + all responses). */
export function unitBandBottom(nodes: ArgumentNode[], node: ArgumentNode): number {
    let bottom = node.row;
    for (const id of unitSubtreeIds(nodes, node.id)) {
        const n = nodes.find((x) => x.id === id);
        if (n && n.row > bottom) bottom = n.row;
    }
    return bottom;
}

/**
 * Joins the node's unit into the unit directly above it (the occupant of the
 * cell one row above the head, same column). The upper unit's head survives;
 * the absorbed head's responses re-parent to it and its own parent link is
 * discarded. Returns the same reference when there is nothing to join.
 */
export function joinWithAbove(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return nodes;
    const head = unitHeadOf(nodes, target);
    const above = nodes.find(
        (n) => n.sheetId === head.sheetId && n.speechId === head.speechId && n.row === head.row - 1,
    );
    if (!above) return nodes;
    const upperKey = unitKeyOf(above);
    if (upperKey === unitKeyOf(target)) return nodes;
    const upperHead = unitHeadOf(nodes, above);
    const memberIds = new Set(unitOf(nodes, target).map((m) => m.id));
    return nodes.map((n) => {
        if (memberIds.has(n.id)) {
            const absorbed = { ...n, unitId: upperKey };
            return n.id === head.id
                ? { ...absorbed, parentId: null, numberOverride: null }
                : absorbed;
        }
        return n.parentId === head.id ? { ...n, parentId: upperHead.id } : n;
    });
}

/**
 * Splits the node's unit at this cell: the cell and every member below it
 * become a new parentless unit keyed by this cell's id. No-op on a head.
 */
export function splitAt(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return nodes;
    const members = unitOf(nodes, target);
    const idx = members.findIndex((m) => m.id === nodeId);
    if (idx <= 0) return nodes;
    const tail = new Set(members.slice(idx).map((m) => m.id));
    return nodes.map((n) => {
        if (!tail.has(n.id)) return n;
        return n.id === nodeId
            ? { ...n, unitId: undefined, parentId: null, numberOverride: null }
            : { ...n, unitId: nodeId };
    });
}

/**
 * Removes a node from its unit without deleting it (the node becomes a
 * self-unit). When the departing node is the head whose id anchors the key,
 * the remaining members are re-keyed to the new head's id - otherwise the
 * departed node's self-key would collide with the old shared key.
 */
export function detachFromUnit(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return nodes;
    const members = unitOf(nodes, target);
    if (members.length < 2) return nodes;
    const remaining = members.filter((m) => m.id !== nodeId);
    const newKey = remaining[0].id;
    const remainingIds = new Set(remaining.map((m) => m.id));
    return nodes.map((n) => {
        if (n.id === nodeId) return { ...n, unitId: undefined };
        if (!remainingIds.has(n.id)) return n;
        return { ...n, unitId: n.id === newKey ? undefined : newKey };
    });
}

/**
 * Removes a node. Deleting a head promotes the next member to head - it
 * inherits the head's parent link and the head's responses re-parent to it -
 * so deleting a cell never vaporizes the answers written under the argument.
 * Non-heads and single-cell units fall back to orphan semantics (children
 * become bare roots in place).
 */
export function removeNodeWithPromotion(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return nodes;
    const members = unitOf(nodes, target);
    const isHead = members[0]?.id === nodeId;
    if (!isHead || members.length < 2) {
        return nodes
            .filter((n) => n.id !== nodeId)
            .map((n) => (n.parentId === nodeId ? { ...n, parentId: null } : n));
    }
    const next = members[1];
    return nodes
        .filter((n) => n.id !== nodeId)
        .map((n) => {
            if (n.id === next.id)
                return {
                    ...n,
                    parentId: target.parentId,
                    numberOverride: target.numberOverride ?? null,
                };
            return n.parentId === nodeId ? { ...n, parentId: next.id } : n;
        });
}

/** Deletes the node's whole unit band: every member and every response. */
export function deleteUnitSubtree(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
    const doomed = unitSubtreeIds(nodes, nodeId);
    if (doomed.size === 0) return nodes;
    return nodes.filter((n) => !doomed.has(n.id));
}
