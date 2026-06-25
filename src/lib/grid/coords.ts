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
