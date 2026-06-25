/**
 * Pure coordinate math for the grid-owns-position flow model.
 * Every argument lives at (speechId, row); at most one node per cell.
 * No mutation, no store access.
 */
import type { ArgumentNode, Speech } from "@/lib/model/types";

/** Column index of a speech, or −1 if not in the column set. */
export function colIndexOf(speeches: Speech[], speechId: string): number {
    return speeches.findIndex((s) => s.id === speechId);
}

/** The node occupying (sheetId, speechId, row), or null. */
export function occupantAt(
    nodes: ArgumentNode[],
    sheetId: string,
    speechId: string,
    row: number,
): ArgumentNode | null {
    return (
        nodes.find(
            (n) =>
                n.sheetId === sheetId &&
                n.speechId === speechId &&
                n.row === row,
        ) ?? null
    );
}

/** Highest row used in a sheet, or −1 when the sheet has no nodes. */
export function maxRow(nodes: ArgumentNode[], sheetId: string): number {
    let m = -1;
    for (const n of nodes) if (n.sheetId === sheetId && n.row > m) m = n.row;
    return m;
}

/** Shift every node in the sheet with row >= fromRow DOWN by `by` (default 1). */
export function rippleDown(
    nodes: ArgumentNode[],
    sheetId: string,
    fromRow: number,
    by = 1,
): ArgumentNode[] {
    return nodes.map((n) =>
        n.sheetId === sheetId && n.row >= fromRow
            ? { ...n, row: n.row + by }
            : n,
    );
}

/** Shift every node in the sheet with row >= fromRow UP by `by` (default 1). */
export function rippleUp(
    nodes: ArgumentNode[],
    sheetId: string,
    fromRow: number,
    by = 1,
): ArgumentNode[] {
    return nodes.map((n) =>
        n.sheetId === sheetId && n.row >= fromRow
            ? { ...n, row: n.row - by }
            : n,
    );
}

export type Spawn = "sibling" | "response";

/** Destination cell for a gesture, or null when impossible. */
export function spawnTarget(
    nodes: ArgumentNode[],
    sheetId: string,
    speeches: Speech[],
    current: ArgumentNode,
    kind: Spawn,
): { speechId: string; row: number } | null {
    if (kind === "sibling") {
        return { speechId: current.speechId, row: current.row + 1 };
    }
    const col = colIndexOf(speeches, current.speechId);
    const next = speeches[col + 1];
    if (!next) return null;
    return { speechId: next.id, row: current.row };
}

/**
 * Resolve a gesture to a free cell, rippling the sheet down at the anchor row
 * when that cell is already occupied. Returns the freed cell plus the updated
 * node array (the new node is NOT created here — the caller inserts it).
 *
 * NOTE: the canonical way to add a SECOND response to the same parent is Enter
 * (sibling) on the first response — that stacks downward and leaves the parent
 * row fixed. Shift+Enter onto an occupied adjacent cell ripples (which shifts
 * the parent with the inserted row); this is an accepted edge behavior.
 */
export function placeForSpawn(
    nodes: ArgumentNode[],
    sheetId: string,
    speeches: Speech[],
    current: ArgumentNode,
    kind: Spawn,
): { nodes: ArgumentNode[]; speechId: string; row: number } | null {
    const target = spawnTarget(nodes, sheetId, speeches, current, kind);
    if (!target) return null;
    // Ripple the whole global row when it is occupied by any node OTHER than the
    // current one. For a response this means the current (parent) node sharing the
    // row does not trigger a ripple; a genuinely occupied adjacent cell does
    // (which shifts the parent with the inserted row — an accepted edge).
    const rowOccupied = nodes.some(
        (n) =>
            n.sheetId === sheetId &&
            n.row === target.row &&
            n.id !== current.id,
    );
    const next = rowOccupied ? rippleDown(nodes, sheetId, target.row, 1) : nodes;
    return { nodes: next, speechId: target.speechId, row: target.row };
}

/** Root id + all transitive descendant ids (cycle-guarded). */
export function descendantIds(
    nodes: ArgumentNode[],
    rootId: string,
): Set<string> {
    const childrenBy = new Map<string, ArgumentNode[]>();
    for (const n of nodes) {
        if (n.parentId === null) continue;
        if (!childrenBy.has(n.parentId)) childrenBy.set(n.parentId, []);
        childrenBy.get(n.parentId)!.push(n);
    }
    const out = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop()!;
        if (out.has(id)) continue;
        out.add(id);
        for (const c of childrenBy.get(id) ?? []) stack.push(c.id);
    }
    return out;
}

/** Translate a subtree by (dCol, dRow); no-op + ok:false on collision/bounds. */
export function translateSubtree(
    nodes: ArgumentNode[],
    speeches: Speech[],
    rootId: string,
    dCol: number,
    dRow: number,
): { nodes: ArgumentNode[]; ok: boolean } {
    const subtree = descendantIds(nodes, rootId);
    const root = nodes.find((n) => n.id === rootId);
    if (!root) return { nodes, ok: false };
    const sheetId = root.sheetId;

    // Compute proposed coords; bail on out-of-bounds columns.
    const moved = new Map<string, { speechId: string; row: number }>();
    for (const n of nodes) {
        if (!subtree.has(n.id)) continue;
        const col = colIndexOf(speeches, n.speechId) + dCol;
        const row = n.row + dRow;
        if (col < 0 || col >= speeches.length || row < 0)
            return { nodes, ok: false };
        moved.set(n.id, { speechId: speeches[col].id, row });
    }

    // Reject if any destination collides with a node OUTSIDE the subtree.
    for (const [id, dest] of moved) {
        const occ = occupantAt(nodes, sheetId, dest.speechId, dest.row);
        if (occ && !subtree.has(occ.id) && occ.id !== id)
            return { nodes, ok: false };
    }

    return {
        nodes: nodes.map((n) =>
            moved.has(n.id) ? { ...n, ...moved.get(n.id)! } : n,
        ),
        ok: true,
    };
}
