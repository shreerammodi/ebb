/**
 * Pure coordinate math for the grid-owns-position flow model.
 * Every argument lives at (speechId, row); at most one node per cell.
 * No mutation, no store access.
 */
import type { ArgumentNode, Speech } from "@/lib/model/types";
import { unitBandBottom, unitSubtreeIds } from "@/lib/model/units";

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
        nodes.find((n) => n.sheetId === sheetId && n.speechId === speechId && n.row === row) ?? null
    );
}

/** Highest row used in a sheet, or −1 when the sheet has no nodes. */
export function maxRow(nodes: ArgumentNode[], sheetId: string): number {
    let m = -1;
    for (const n of nodes) if (n.sheetId === sheetId && n.row > m) m = n.row;
    return m;
}

/**
 * The deepest grid row spanned by a node's entire subtree (the node plus all
 * transitive responses, across every column). This is the bottom of the node's
 * "band" — the vertical space the exchange rooted at this node occupies.
 */
export function subtreeMaxRow(nodes: ArgumentNode[], nodeId: string): number {
    const ids = descendantIds(nodes, nodeId);
    let m = -1;
    for (const n of nodes) if (ids.has(n.id) && n.row > m) m = n.row;
    return m;
}

/**
 * True when (speechId, row) is an EMPTY cell that falls strictly inside the
 * band of an argument living above it in the same column. Such cells sit beside
 * another argument's responses; placing a new argument there would interleave
 * it into the exchange, so the UI greys them out and blocks placement.
 */
export function isReservedCell(
    nodes: ArgumentNode[],
    sheetId: string,
    speechId: string,
    row: number,
): boolean {
    if (occupantAt(nodes, sheetId, speechId, row)) return false;
    for (const p of nodes) {
        if (p.sheetId !== sheetId || p.speechId !== speechId) continue;
        if (p.row < row && row <= unitBandBottom(nodes, p)) return true;
    }
    return false;
}

export type JumpDir = "up" | "down" | "left" | "right";

/**
 * Excel "Ctrl/Cmd+Arrow" data-edge jump. Treats the sheet's used range as
 * rows [0 .. max(lastFilledRow, cursorRow)] × columns [0 .. last speech].
 *
 * - From a filled cell whose neighbour in `dir` is also filled → jump to the end
 *   of that contiguous run.
 * - Otherwise → jump to the next filled cell in `dir`, skipping empties.
 * - If no filled cell lies ahead → jump to the used-range edge in `dir`.
 *
 * Reserved (greyed) cells count as empty and are never a landing spot: if the
 * computed target is reserved, the cursor stays put.
 */
export function jumpTarget(
    nodes: ArgumentNode[],
    sheetId: string,
    speeches: Speech[],
    from: { speechId: string; row: number },
    dir: JumpDir,
): { speechId: string; row: number } {
    const cols = speeches.length;
    const col = colIndexOf(speeches, from.speechId);
    if (col < 0) return from;

    const bottom = Math.max(maxRow(nodes, sheetId), from.row, 0);
    const dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const dr = dir === "up" ? -1 : dir === "down" ? 1 : 0;

    const inB = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r <= bottom;
    const filled = (c: number, r: number) => occupantAt(nodes, sheetId, speeches[c].id, r) !== null;

    // Already at the edge in this direction → stay.
    if (!inB(col + dc, from.row + dr)) return from;

    let c = col + dc;
    let r = from.row + dr;

    if (filled(col, from.row) && filled(c, r)) {
        // Extend through the contiguous filled run.
        while (inB(c + dc, r + dr) && filled(c + dc, r + dr)) {
            c += dc;
            r += dr;
        }
    } else {
        // Skip empties to the next filled cell.
        while (inB(c, r) && !filled(c, r)) {
            c += dc;
            r += dr;
        }
        if (!inB(c, r) || !filled(c, r)) {
            // Nothing filled ahead — land on the used-range edge.
            c = dc > 0 ? cols - 1 : dc < 0 ? 0 : col;
            r = dr > 0 ? bottom : dr < 0 ? 0 : from.row;
        }
    }

    if (isReservedCell(nodes, sheetId, speeches[c].id, r)) return from;
    return { speechId: speeches[c].id, row: r };
}

/**
 * Corner jump. "home" → top-left of the sheet (first column, row 0). "end" →
 * the bottom-right-most filled cell (deepest row, then rightmost column). Empty
 * sheet → top-left.
 */
export function cornerTarget(
    nodes: ArgumentNode[],
    sheetId: string,
    speeches: Speech[],
    which: "home" | "end",
): { speechId: string; row: number } {
    if (which === "home" || speeches.length === 0) {
        return { speechId: speeches[0]?.id ?? "", row: 0 };
    }
    const inSheet = nodes.filter(
        (n) => n.sheetId === sheetId && colIndexOf(speeches, n.speechId) >= 0,
    );
    if (inSheet.length === 0) return { speechId: speeches[0].id, row: 0 };
    const maxR = inSheet.reduce((m, n) => Math.max(m, n.row), 0);
    const atBottom = inSheet.filter((n) => n.row === maxR);
    const best = atBottom.reduce((b, n) =>
        colIndexOf(speeches, n.speechId) > colIndexOf(speeches, b.speechId) ? n : b,
    );
    return { speechId: best.speechId, row: best.row };
}

/** Shift every node in the sheet with row >= fromRow DOWN by `by` (default 1). */
export function rippleDown(
    nodes: ArgumentNode[],
    sheetId: string,
    fromRow: number,
    by = 1,
    exclude?: Set<string>,
): ArgumentNode[] {
    return nodes.map((n) =>
        n.sheetId === sheetId && n.row >= fromRow && (exclude === undefined || !exclude.has(n.id))
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
        n.sheetId === sheetId && n.row >= fromRow ? { ...n, row: n.row - by } : n,
    );
}

export type Spawn = "continue" | "sibling" | "response";

/** Destination cell for a gesture, or null when impossible. */
export function spawnTarget(
    nodes: ArgumentNode[],
    sheetId: string,
    speeches: Speech[],
    current: ArgumentNode,
    kind: Spawn,
): { speechId: string; row: number } | null {
    if (kind === "continue") {
        // The next cell of the SAME argument: directly below the source cell.
        return { speechId: current.speechId, row: current.row + 1 };
    }
    if (kind === "sibling") {
        // A new argument lands BELOW the current UNIT's whole band (its cells
        // plus every response), not at current.row + 1 — otherwise it splits a
        // multi-row exchange.
        return {
            speechId: current.speechId,
            row: unitBandBottom(nodes, current) + 1,
        };
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
    // Decide when to ripple a full-width row in to make room.
    //
    // A response lands in the next column ON THE PARENT'S ROW — that row IS meant
    // to hold an argument and its responses together. So a response only needs its
    // own destination CELL free; the row being filled by the parent (or the
    // parent's own parent in an earlier column) is the normal, desired state.
    //
    // When the destination cell IS occupied, ripple — but EXCLUDE the parent
    // chain (the current node and its ancestors) from the shift. The parent
    // stays on its row and the response lands beside it; only unrelated nodes
    // (or the parent's own existing responses) get pushed down. Rippling the
    // parent too would leave the new response one row ABOVE its parent.
    //
    // A sibling lands on a fresh row below the current subtree's band, so it
    // needs that whole row free — ripple when any other node occupies it.
    const needsRipple =
        kind === "response"
            ? occupantAt(nodes, sheetId, target.speechId, target.row) !== null
            : nodes.some(
                  (n) => n.sheetId === sheetId && n.row === target.row && n.id !== current.id,
              );
    const next =
        needsRipple && kind === "response"
            ? rippleDown(nodes, sheetId, target.row, 1, ancestorIds(nodes, current.id))
            : needsRipple
              ? rippleDown(nodes, sheetId, target.row, 1)
              : nodes;
    return { nodes: next, speechId: target.speechId, row: target.row };
}

/** A node plus all its ancestors (parent chain up to root), cycle-guarded. */
export function ancestorIds(nodes: ArgumentNode[], nodeId: string): Set<string> {
    const byId = new Map<string, ArgumentNode>();
    for (const n of nodes) byId.set(n.id, n);
    const out = new Set<string>();
    let current: string | undefined = nodeId;
    while (current !== undefined) {
        if (out.has(current)) break;
        out.add(current);
        const node = byId.get(current);
        current = node?.parentId ?? undefined;
    }
    return out;
}

/** Root id + all transitive descendant ids (cycle-guarded). */
export function descendantIds(nodes: ArgumentNode[], rootId: string): Set<string> {
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

/**
 * Invariant guard: after a move, no parent may share or come AFTER any of
 * its descendants in column order. The flow model requires
 * parent.col < child.col for every parent→child edge. A move that would
 * violate this (e.g. dragging a parent into its own child's column or
 * later) is rejected before any mutation.
 *
 * We validate against the *post-move* column assignment so callers get a
 * single pre-check instead of discovering the violation after commit.
 */
function violatesColumnInvariant(
    nodes: ArgumentNode[],
    speeches: Speech[],
    moved: Map<string, { speechId: string; row: number }>,
): boolean {
    // Build a column-lookup that reflects the proposed move.
    const effectiveCol = new Map<string, number>();
    for (const n of nodes) {
        const dest = moved.get(n.id);
        effectiveCol.set(n.id, colIndexOf(speeches, dest ? dest.speechId : n.speechId));
    }
    // Check every parent→child edge (only within the sheet matters).
    for (const n of nodes) {
        if (n.parentId === null) continue;
        const parentCol = effectiveCol.get(n.parentId);
        const childCol = effectiveCol.get(n.id);
        if (parentCol === undefined || childCol === undefined) continue;
        // Parent must be in a STRICTLY earlier column than the child.
        if (parentCol >= childCol) return true;
    }
    return false;
}

/**
 * Translate a subtree by (dCol, dRow).
 *
 * Alignment guarantee: every node in the moved subtree receives the same
 * (dCol, dRow) delta, so the internal parent→child geometry is preserved
 * exactly. A parent and all its children maintain their relative positions.
 *
 * Collision handling: when the target cells are occupied by non-subtree nodes,
 * the sheet is rippled down (from the minimum targeted row) by the full span
 * of the moving subtree, making room. The moving subtree itself is excluded
 * from the ripple so it lands cleanly at the target.
 *
 * Returns { nodes, ok: false } when the move is impossible (out of column
 * bounds, negative rows, or would violate the parent-col < child-col
 * invariant that every flow relies on).
 */
export function translateSubtree(
    nodes: ArgumentNode[],
    speeches: Speech[],
    rootId: string,
    dCol: number,
    dRow: number,
): { nodes: ArgumentNode[]; ok: boolean } {
    return translateNodes(nodes, speeches, descendantIds(nodes, rootId), dCol, dRow);
}

/**
 * Translate an arbitrary set of nodes by (dCol, dRow) as one rigid band.
 * Same collision policy as subtree moves: occupied destination cells ripple
 * the sheet down by the band's span, excluding the moving set - plus
 * `rippleExclude`, for callers (link snap) whose anchor must not shift.
 */
export function translateNodes(
    nodes: ArgumentNode[],
    speeches: Speech[],
    moving: Set<string>,
    dCol: number,
    dRow: number,
    rippleExclude?: Set<string>,
): { nodes: ArgumentNode[]; ok: boolean } {
    const first = nodes.find((n) => moving.has(n.id));
    if (!first) return { nodes, ok: false };
    const sheetId = first.sheetId;

    // No-op: zero delta means nothing changes, succeed without mutation.
    if (dCol === 0 && dRow === 0) return { nodes, ok: true };

    // Compute proposed coords; bail on out-of-bounds columns / negative rows.
    const moved = new Map<string, { speechId: string; row: number }>();
    for (const n of nodes) {
        if (!moving.has(n.id)) continue;
        const col = colIndexOf(speeches, n.speechId) + dCol;
        const row = n.row + dRow;
        if (col < 0 || col >= speeches.length || row < 0) return { nodes, ok: false };
        moved.set(n.id, { speechId: speeches[col].id, row });
    }

    // Structural invariant: after the move, every parent must still be in a
    // strictly earlier column than each of its children. Reject the move
    // before any mutation if this would break.
    if (violatesColumnInvariant(nodes, speeches, moved)) return { nodes, ok: false };

    // Build a fast lookup for cell occupancy. O(n) once, then O(1) per check.
    const occupancy = new Map<string, ArgumentNode>();
    for (const n of nodes) {
        if (n.sheetId !== sheetId) continue;
        occupancy.set(`${n.speechId}:${n.row}`, n);
    }

    // Check for collisions at the destination: nodes outside the moving set
    // (and not explicitly excluded) occupying any of the cells it wants.
    let hasCollision = false;
    for (const [, dest] of moved) {
        const occ = occupancy.get(`${dest.speechId}:${dest.row}`);
        if (occ && !moving.has(occ.id) && !(rippleExclude?.has(occ.id) ?? false)) {
            hasCollision = true;
            break;
        }
    }

    // If there are collisions, ripple the sheet (outside the moving set and any
    // excluded anchors) down from the minimum targeted row by the moving band's
    // vertical span. This clears a gap the exact size of the moving band.
    let resolved = nodes;
    if (hasCollision) {
        const targetRows = [...moved.values()].map((v) => v.row);
        const minTargetRow = Math.min(...targetRows);
        const maxTargetRow = Math.max(...targetRows);
        const span = maxTargetRow - minTargetRow + 1;
        const exclude = rippleExclude ? new Set([...moving, ...rippleExclude]) : moving;
        resolved = rippleDown(nodes, sheetId, minTargetRow, span, exclude);
    }

    return {
        nodes: resolved.map((n) => (moved.has(n.id) ? { ...n, ...moved.get(n.id)! } : n)),
        ok: true,
    };
}

/** Vertical translation of a unit's whole band (members + responses). */
export function translateUnit(
    nodes: ArgumentNode[],
    speeches: Speech[],
    memberId: string,
    dRow: number,
    rippleExclude?: Set<string>,
): { nodes: ArgumentNode[]; ok: boolean } {
    return translateNodes(nodes, speeches, unitSubtreeIds(nodes, memberId), 0, dRow, rippleExclude);
}
