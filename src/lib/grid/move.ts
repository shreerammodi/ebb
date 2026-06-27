/**
 * Keyboard "grab & move" reparenting logic.
 *
 * Move mode lets a keyboard user grab the selected argument and steer a cursor
 * to any target cell, then drop — the keyboard mirror of mouse drag-to-reparent.
 * These pure helpers decide where the cursor lands (spatial grid navigation) and
 * whether a given target is a legal destination, so the command layer stays thin
 * and the rules are unit-tested.
 *
 * ASSUMPTION (shared with layout.ts): a response lives in a LATER column than its
 * parent. So a legal reparent target is always in an EARLIER column than the
 * grabbed node, and never the node itself or one of its descendants (that would
 * make a cycle the layout merely tolerates).
 */

import type { ArgumentNode, Speech } from "@/lib/model/types";

import { buildLayout, type PlacedNode } from "./layout";

/** A destination the move cursor can sit on: an existing node, or an empty cell. */
export type MoveTarget =
    | { kind: "node"; nodeId: string }
    | { kind: "empty"; speechId: string; row: number };

/** A move-cursor position expressed the way `selection` is. */
export interface MoveCursor {
    speechId: string;
    nodeId: string; // "" for an empty cell
    row?: number;
}

/** Column index of a speech, or -1. */
function colOf(speeches: Speech[], speechId: string): number {
    return speeches.findIndex((s) => s.id === speechId);
}

/** Every descendant id of `sourceId` within its sheet (excludes the source). */
export function descendantIds(nodes: ArgumentNode[], sourceId: string): Set<string> {
    const out = new Set<string>();
    const stack = [sourceId];
    while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const n of nodes) {
            if (n.parentId === cur && !out.has(n.id)) {
                out.add(n.id);
                stack.push(n.id);
            }
        }
    }
    return out;
}

/**
 * Can the grabbed node be dropped on `target`?
 * - node target: not the source, not a descendant, and in an earlier column.
 * - empty target: always legal (rehome to that speech as a root).
 */
export function isValidMoveTarget(
    nodes: ArgumentNode[],
    speeches: Speech[],
    sourceId: string,
    target: MoveTarget,
): boolean {
    const source = nodes.find((n) => n.id === sourceId);
    if (!source) return false;

    if (target.kind === "empty") {
        return colOf(speeches, target.speechId) !== -1;
    }

    if (target.nodeId === sourceId) return false;
    const targetNode = nodes.find((n) => n.id === target.nodeId);
    if (!targetNode || targetNode.sheetId !== source.sheetId) return false;
    if (descendantIds(nodes, sourceId).has(targetNode.id)) return false;

    const sourceCol = colOf(speeches, source.speechId);
    const targetCol = colOf(speeches, targetNode.speechId);
    return targetCol !== -1 && sourceCol !== -1 && targetCol < sourceCol;
}

/** Build (row,col) → node | "covered" the same way FlowGrid does. */
function cellMapOf(placed: PlacedNode[]): Map<string, PlacedNode | "covered"> {
    const map = new Map<string, PlacedNode | "covered">();
    for (const p of placed) {
        map.set(`${p.startRow},${p.col}`, p);
        for (let r = p.startRow + 1; r < p.startRow + p.rowSpan; r++) {
            map.set(`${r},${p.col}`, "covered");
        }
    }
    return map;
}

/** What sits at (col,row): the node occupying it, or an empty cell. */
export function cursorAt(
    sheetNodes: ArgumentNode[],
    speeches: Speech[],
    col: number,
    row: number,
): MoveCursor {
    const { placed } = buildLayout(sheetNodes, speeches);
    const map = cellMapOf(placed);
    const entry = map.get(`${row},${col}`);
    if (entry && entry !== "covered") {
        return { speechId: speeches[col].id, nodeId: entry.node.id };
    }
    if (entry === "covered") {
        const owner = placed.find(
            (p) => p.col === col && p.startRow <= row && row < p.startRow + p.rowSpan,
        );
        if (owner) return { speechId: speeches[col].id, nodeId: owner.node.id };
    }
    return { speechId: speeches[col].id, nodeId: "", row };
}

/** The current cursor's (col,row) from a selection-shaped position. */
function cursorRowCol(
    sheetNodes: ArgumentNode[],
    speeches: Speech[],
    cur: MoveCursor,
): { col: number; row: number } {
    const col = Math.max(0, colOf(speeches, cur.speechId));
    if (cur.nodeId === "") return { col, row: cur.row ?? 0 };
    const { placed } = buildLayout(sheetNodes, speeches);
    const p = placed.find((x) => x.node.id === cur.nodeId);
    return { col, row: p ? p.startRow : 0 };
}

export type MoveDir = "up" | "down" | "left" | "right";

/** Step the move cursor one cell in `dir`, clamped to the grid, and resolve it. */
export function stepMoveCursor(
    sheetNodes: ArgumentNode[],
    speeches: Speech[],
    cur: MoveCursor,
    dir: MoveDir,
): MoveCursor {
    const { totalRows } = buildLayout(sheetNodes, speeches);
    const { col, row } = cursorRowCol(sheetNodes, speeches, cur);
    const maxRow = Math.max(totalRows - 1, 0);
    const maxCol = speeches.length - 1;

    let nc = col;
    let nr = row;
    if (dir === "left") nc = Math.max(0, col - 1);
    else if (dir === "right") nc = Math.min(maxCol, col + 1);
    else if (dir === "up") nr = Math.max(0, row - 1);
    else nr = Math.min(maxRow, row + 1);

    return cursorAt(sheetNodes, speeches, nc, nr);
}
