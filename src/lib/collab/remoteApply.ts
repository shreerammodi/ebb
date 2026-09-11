/**
 * What a partner's change is allowed to touch.
 *
 * One decision, in one place, so the rule that governs all of it cannot drift:
 * a remote apply adjusts indices and never navigates. It does not scroll, it
 * does not take focus, and it does not write under an open editor. A partner's
 * edits are visible and never directive, because the person at this keyboard
 * is mid-speech and cannot afford to be moved.
 */

import { modelCol, type ModelCol } from "@/lib/grid/colSpace";

import { liveCells, sheetWidth } from "./doc";
import { followSelection, type CellRef } from "./selection";
import type { CollabDoc, CollabSheet } from "./types";
import type { StructuralChange } from "./undoRebase";

export interface ApplyContext {
    editorOpen: boolean;
    editorCell: { sheetId: string; col: ModelCol; row: number } | null;
    selection: { sheetId: string; col: ModelCol; row: number } | null;
    activeSheetId: string | null;
}

export interface ApplyPlan {
    /** Whether any cell may be written into the grid at all. */
    writeCells: boolean;
    /** Cells held back because the editor is open on them. */
    deferredCells: CellRef[];
    /** The row the selection moves to, or null to leave it where it is. */
    selectRow: number | null;
    /** The column or whole-row shifts the undo stack has to be corrected for. */
    structural: StructuralChange[];
    /**
     * Typed as the literal false. The hard rule is that a remote apply never
     * scrolls, and a type is harder to forget than a comment.
     */
    scroll: false;
    /** The active sheet a partner deleted out from under the viewer. */
    leftSheet: string | null;
}

/**
 * The structural change a partner made to one column, in the terms the undo
 * stack needs. Derived from the live heights rather than from the op, because
 * a delta can carry several ops at once and only the net effect matters.
 */
function structuralForColumn(
    before: CollabSheet,
    after: CollabSheet,
    col: number,
): StructuralChange | null {
    const was = liveCells(before, col).length;
    const now = liveCells(after, col).length;
    const at = firstMovedRow(before, after, col);
    if (now > was) {
        return {
            kind: "insertRow",
            at,
            amount: now - was,
            scope: { kind: "column", col },
        };
    }
    if (now < was) {
        return {
            kind: "removeRow",
            at,
            amount: was - now,
            scope: { kind: "column", col },
        };
    }
    return null;
}

/** The first row whose identity changed, which is where a shift began. */
function firstMovedRow(before: CollabSheet, after: CollabSheet, col: number): number {
    const was = liveCells(before, col);
    const now = liveCells(after, col);
    const shared = Math.min(was.length, now.length);
    for (let row = 0; row < shared; row++) {
        if (was[row].rank !== now[row].rank || was[row].actor !== now[row].actor) return row;
    }
    return shared;
}

/** All structural shifts in a sheet, with a common shift collapsed to a row scope. */
function structuralForSheet(before: CollabSheet, after: CollabSheet): StructuralChange[] {
    const width = Math.max(sheetWidth(before), sheetWidth(after));
    const changes: StructuralChange[] = [];
    for (let col = 0; col < width; col++) {
        const change = structuralForColumn(before, after, col);
        if (change) changes.push(change);
    }
    if (width === 0 || changes.length !== width) return changes;

    const first = changes[0]!;
    if (
        !changes.every(
            (change) =>
                change.kind === first.kind &&
                change.at === first.at &&
                change.amount === first.amount,
        )
    ) {
        return changes;
    }
    if (first.kind === "insertRow") {
        return [{ kind: "insertRow", at: first.at, amount: first.amount, scope: { kind: "row" } }];
    }
    return [{ kind: "removeRow", at: first.at, amount: first.amount, scope: { kind: "row" } }];
}

export function planRemoteApply(before: CollabDoc, after: CollabDoc, ctx: ApplyContext): ApplyPlan {
    const plan: ApplyPlan = {
        writeCells: true,
        deferredCells: [],
        selectRow: null,
        structural: [],
        scroll: false,
        leftSheet: null,
    };

    // A sheet the viewer is standing on that a partner removed.
    if (ctx.activeSheetId) {
        const wasSheet = before.sheets[ctx.activeSheetId];
        const nowSheet = after.sheets[ctx.activeSheetId];
        const wasAlive = wasSheet?.deleted === null;
        const nowGone = nowSheet?.deleted !== null;
        if (wasAlive && nowGone) plan.leftSheet = ctx.activeSheetId;
        if (wasSheet && nowSheet) plan.structural = structuralForSheet(wasSheet, nowSheet);
    }

    // The cell under an open editor is held back. It is already in the
    // replica, so last-writer-wins still decides; only the grid write waits,
    // so nothing overwrites what is being typed right now.
    if (ctx.editorOpen && ctx.editorCell) {
        const sheet = after.sheets[ctx.editorCell.sheetId];
        const cell = sheet ? liveCells(sheet, ctx.editorCell.col)[ctx.editorCell.row] : undefined;
        if (cell) {
            plan.deferredCells.push({
                col: modelCol(cell.col),
                rank: cell.rank,
                actor: cell.actor,
            });
        }
    }

    const sel = ctx.selection;
    if (!sel) return plan;

    const wasSheet = before.sheets[sel.sheetId];
    const nowSheet = after.sheets[sel.sheetId];
    if (!wasSheet || !nowSheet) return plan;

    const followed = followSelection(wasSheet, nowSheet, sel.row, sel.col);
    // Null means leave it alone, which is also what happens when the cursor's
    // own row was the one deleted: it holds its index rather than jumping.
    plan.selectRow = followed === sel.row ? null : followed;
    return plan;
}
