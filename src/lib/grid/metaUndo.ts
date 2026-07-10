/**
 * Decoration undo. Handsontable's undo stack records `setDataAtCell` and
 * ignores `setCellMeta`, so a shift that moves text and classes together comes
 * apart on undo: the text returns and the class stays where the shift put it.
 *
 * The fix pairs each pushed undo action with a `{before, after}` snapshot of the
 * touched columns' classes. It uses documented hooks only, so if a future
 * Handsontable stops firing the stack-change hooks the decoration undo silently
 * no-ops and text undo keeps working.
 */

import type { CellGrid } from "./cellShift";

/** One decorated cell: row, column, and its full className string. */
export type ClassEntry = [row: number, col: number, className: string];

export interface MetaSnapshot {
    /** The columns the snapshots cover; restoring clears these in full first. */
    cols: number[];
    before: ClassEntry[];
    after: ClassEntry[];
}

// The stack-change hooks hand out the live action objects, so a WeakMap keyed on
// them collects its records for free when the redo stack is cleared. The action
// afterUndo and afterRedo receive is a deepClone, useless as a key, so the
// action under an undo or redo is captured from the stack move that precedes it:
// undoing pushes onto the redo stack, redoing pushes back onto the undo stack.
const snapshots = new WeakMap<object, MetaSnapshot>();
let lastPushed: object | null = null;
let lastUndone: object | null = null;

/** Records the decorated cells of `cols`, top to bottom. */
export function snapshotClasses(grid: CellGrid, cols: number[]): ClassEntry[] {
    const entries: ClassEntry[] = [];
    for (let r = 0; r < grid.countRows(); r++) {
        for (const c of cols) {
            const cls = (grid.getCellMeta(r, c).className ?? "") as string;
            if (cls) entries.push([r, c, cls]);
        }
    }
    return entries;
}

function applyClasses(grid: CellGrid, cols: number[], entries: ClassEntry[]): void {
    for (let r = 0; r < grid.countRows(); r++) {
        for (const c of cols) grid.setCellMeta(r, c, "className", "");
    }
    for (const [r, c, cls] of entries) grid.setCellMeta(r, c, "className", cls);
}

/**
 * `afterUndoStackChange`: remembers the action just pushed onto the undo stack,
 * whether by a fresh write or by a redo putting one back.
 */
export function onUndoStackChange(before: readonly object[], after: readonly object[]): void {
    lastPushed = after.length > before.length ? (after[after.length - 1] ?? null) : null;
}

/** `afterRedoStackChange`: remembers the action an undo just took off. */
export function onRedoStackChange(before: readonly object[], after: readonly object[]): void {
    lastUndone = after.length > before.length ? (after[after.length - 1] ?? null) : null;
}

/**
 * Binds a decoration snapshot to the action the preceding `setDataAtCell`
 * pushed. Call it after that write, never before: until the write lands there is
 * no action to key on. Clearing the reference keeps a write that pushed nothing
 * from stealing the previous action's snapshot.
 */
export function attachMetaUndo(snap: MetaSnapshot): void {
    if (!lastPushed) return;
    snapshots.set(lastPushed, snap);
    lastPushed = null;
}

/** `afterUndo`. Returns whether a snapshot was found and restored. */
export function restoreMetaUndo(grid: CellGrid): boolean {
    const snap = lastUndone && snapshots.get(lastUndone);
    if (!snap) return false;
    applyClasses(grid, snap.cols, snap.before);
    return true;
}

/** `afterRedo`. Returns whether a snapshot was found and restored. */
export function restoreMetaRedo(grid: CellGrid): boolean {
    const snap = lastPushed && snapshots.get(lastPushed);
    if (!snap) return false;
    applyClasses(grid, snap.cols, snap.after);
    return true;
}

/** Drops the pending action references. Tests call this between grids. */
export function resetMetaUndo(): void {
    lastPushed = null;
    lastUndone = null;
}
