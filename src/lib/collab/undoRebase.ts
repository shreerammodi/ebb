/**
 * Keeping undo honest across a partner's structural change.
 *
 * Handsontable's undo stack stores row indices. A remote cell or row insert
 * makes some pending indices stale, and an undo would then write into a row
 * the debater never touched. Rebasing the shapes this build understands keeps
 * the history; anything else clears it, because losing history beats writing
 * to the wrong cell.
 */

/** Which columns a partner's structural change moves. */
export type StructuralScope = { kind: "column"; col: number } | { kind: "row" };

/** What a partner did, in the terms the stack has to be corrected for. */
export type StructuralChange =
    | { kind: "insertRow"; at: number; amount: number; scope: StructuralScope }
    | { kind: "removeRow"; at: number; amount: number; scope: StructuralScope };

/** One entry of Handsontable's own undo stack, in the parts that carry rows. */
export interface UndoAction {
    actionType: string;
    index?: number;
    amount?: number;
    changes?: [row: number, prop: number | string, oldValue: unknown, newValue: unknown][];
}

/** The shapes whose row indices this build knows how to correct. */
const REBASEABLE: Record<string, true> = {
    change: true,
    insert_row: true,
    remove_row: true,
};

export function structuralAffectsColumn(change: StructuralChange, col: number): boolean {
    return change.scope.kind === "row" || change.scope.col === col;
}

export function rebaseRow(row: number, change: StructuralChange, col?: number): number | null {
    if (change.scope.kind === "column" && (typeof col !== "number" || change.scope.col !== col)) {
        return row;
    }
    if (change.kind === "insertRow") {
        return row >= change.at ? row + change.amount : row;
    }
    if (row < change.at) return row;
    // The row this action names no longer exists.
    if (row < change.at + change.amount) return null;
    return row - change.amount;
}

/**
 * Each action corrected for `change`, or null where it cannot be.
 *
 * One slot per action, in order, so the caller can keep what is still
 * honest: a history is undone from the top, and an entry that cannot be
 * corrected takes with it only what sits beneath it, since none of that is
 * reachable without undoing through it first.
 *
 * Never mutates the actions it is given: Handsontable owns those objects, and
 * `metaUndo` keys its parallel snapshots on their identity.
 */
export function rebaseActions(
    actions: readonly UndoAction[],
    change: StructuralChange,
): (UndoAction | null)[] {
    return actions.map((action) => {
        if (!REBASEABLE[action.actionType]) return null;

        if (action.changes) {
            const changes: NonNullable<UndoAction["changes"]> = [];
            for (const [row, prop, oldValue, newValue] of action.changes) {
                const moved = rebaseRow(row, change, typeof prop === "number" ? prop : undefined);
                if (moved === null) return null;
                changes.push([moved, prop, oldValue, newValue]);
            }
            return { ...action, changes };
        }

        // A whole-row action carries one index for every column. Once only one
        // column has shifted, no single corrected index can still name that
        // action honestly.
        if (
            change.scope.kind === "column" &&
            (action.actionType === "insert_row" || action.actionType === "remove_row") &&
            typeof action.index === "number"
        ) {
            return null;
        }

        if (typeof action.index === "number") {
            const moved = rebaseRow(action.index, change);
            if (moved === null) return null;
            return { ...action, index: moved };
        }

        return { ...action };
    });
}
