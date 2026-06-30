/**
 * Pure sheet-collection operations.
 *
 * Mirrors `tree.ts` / `groups.ts`: framework-agnostic transforms over the
 * `sheets` (and, for add/remove, the scoped `nodes`/`groups`) arrays. The store
 * owns orchestration (active sheet, selection, undo payloads); these functions
 * own the array mutations so every sheet edit lives behind a testable reducer.
 */

import { uid } from "@/lib/model/ids";
import type { ArgGroup, ArgumentNode, Format, Sheet } from "@/lib/model/types";

/** A sheet plus the round data scoped to it. */
export interface SheetData {
    sheets: Sheet[];
    nodes: ArgumentNode[];
    groups: ArgGroup[];
}

/**
 * Builds a new flow sheet ordered one past the current max. Its leftmost column
 * derives from the side: neg sheets start at the first neg speech, aff sheets at
 * the first speech. Pure constructor; does not append.
 */
export function createSheet(
    sheets: Sheet[],
    format: Format,
    input: { title: string; group: "aff" | "neg" },
): Sheet {
    const maxOrder = sheets.length > 0 ? Math.max(...sheets.map((s) => s.order)) : -1;
    const firstNeg = format.speeches.find((s) => s.side === "neg")?.id;
    return {
        id: uid("sheet"),
        title: input.title,
        group: input.group,
        order: maxOrder + 1,
        kind: "flow",
        startSpeechId: input.group === "neg" ? firstNeg : format.speeches[0]?.id,
    };
}

/** Returns a new array with the target sheet's title updated. */
export function renameSheet(sheets: Sheet[], sheetId: string, title: string): Sheet[] {
    return sheets.map((s) => (s.id === sheetId ? { ...s, title } : s));
}

/**
 * Returns a new array with the target sheet's `order` set. Callers avoid
 * collisions (e.g. pass fractional values).
 */
export function reorderSheet(sheets: Sheet[], sheetId: string, order: number): Sheet[] {
    return sheets.map((s) => (s.id === sheetId ? { ...s, order } : s));
}

/** Drops a sheet along with the nodes and groups scoped to it. */
export function removeSheet(
    sheets: Sheet[],
    nodes: ArgumentNode[],
    groups: ArgGroup[],
    sheetId: string,
): SheetData {
    return {
        sheets: sheets.filter((s) => s.id !== sheetId),
        nodes: nodes.filter((n) => n.sheetId !== sheetId),
        groups: groups.filter((g) => g.sheetId !== sheetId),
    };
}

/**
 * Re-inserts a previously removed sheet with its nodes and groups. The sheet's
 * own `order` restores its original position among the remaining sheets.
 */
export function restoreSheet(
    sheets: Sheet[],
    nodes: ArgumentNode[],
    groups: ArgGroup[],
    sheet: Sheet,
    sheetNodes: ArgumentNode[],
    sheetGroups: ArgGroup[],
): SheetData {
    return {
        sheets: [...sheets, sheet],
        nodes: [...nodes, ...sheetNodes],
        groups: [...groups, ...sheetGroups],
    };
}
