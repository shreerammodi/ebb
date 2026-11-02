/**
 * Provenance hygiene: a cell's source is a claim about where its text came
 * from, so a cell the user emptied has nothing left to claim.
 *
 * Without this the claim outlives the text. The blank cell keeps wearing the
 * linked rail, collectMeta writes the source back into the stored sheet so
 * CardMirror's "Reveal in Flow" selects a blank cell, and text typed into that
 * cell later inherits provenance it never had.
 *
 * Editing a sent cell is not emptying it. A debater shortens a tag constantly,
 * and the cell still came from that card, so only an empty cell breaks its
 * link. This matches CardMirror, where an edited linked copy stays linked.
 */

import type { CellGrid } from "./cellShift";
import { EXTENDED_CLASS } from "./codec";
import { attachMetaUndo, snapshotClasses } from "./metaUndo";

/**
 * The `setDataAtCell` change source every structured write names itself with.
 *
 * A write that names nothing arrives as "edit", which is also what a typed cell
 * and the Delete key produce, so the two are indistinguishable without this.
 * The structured writes slide text between cells and then attach a meta undo
 * snapshot of their own. Breaking links under one of them would consume the
 * undo action it is about to claim and leave its decorations un-undoable, so
 * only a direct cell edit reaches this module.
 */
export const STRUCTURED_WRITE = "ebb.structured";

/**
 * The change source a partner's write carries onto the grid.
 *
 * It is already in the replica and already in the store, so every hook that
 * mirrors a local edit outward has to let it past: recording it as an op would
 * bounce a peer's own text back at them, and snapshotting it would push the
 * grid over the projection that just produced it.
 */
export const REMOTE_WRITE = "ebb.remote";

/** One entry of Handsontable's `afterChange` payload. */
export type GridChange = [row: number, prop: string | number, oldValue: unknown, newValue: unknown];

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === "";
}

function tokens(className: unknown): string[] {
    return typeof className === "string" ? className.split(/\s+/).filter(Boolean) : [];
}

function hasToken(className: unknown, token: string): boolean {
    return tokens(className).includes(token);
}

function withoutToken(className: unknown, token: string): string {
    return tokens(className)
        .filter((t) => t !== token)
        .join(" ");
}

/**
 * Clears stale meta from every cell `changes` emptied, and pairs the clear with
 * the undo action the write just pushed. A direct edit keeps decorations; a cut
 * moves only text, so its source decorations must be removed explicitly.
 *
 * The extension arrow goes with the text on either path. Like a source, it is
 * a claim about where the text came from rather than a decoration the debater
 * chose, so an emptied cell has nothing left to mark, and text typed there
 * later is not an extension.
 *
 * Call it from `afterChange`: Handsontable records the undo action on
 * `beforeChange`, so the action this snapshot binds to is already on the stack.
 */
export function breakEmptiedLinks(
    grid: CellGrid,
    changes: readonly GridChange[],
    clearDecorations = false,
): [row: number, col: number][] {
    const hits: [row: number, col: number][] = [];
    for (const [row, prop, , newValue] of changes) {
        // A flow sheet holds array rows, so Handsontable's prop is the column.
        const col = Number(prop);
        if (!Number.isInteger(col) || !isEmpty(newValue)) continue;
        const meta = grid.getCellMeta(row, col);
        const extended = hasToken(meta.className, EXTENDED_CLASS);
        if (meta.source || extended || (clearDecorations && meta.className)) {
            hits.push([row, col]);
        }
    }
    if (hits.length === 0) return hits;

    const cols = [...new Set(hits.map(([, col]) => col))];
    const before = snapshotClasses(grid, cols);
    for (const [row, col] of hits) {
        const className = grid.getCellMeta(row, col).className;
        grid.setCellMeta(
            row,
            col,
            "className",
            clearDecorations ? "" : withoutToken(className, EXTENDED_CLASS),
        );
        grid.setCellMeta(row, col, "source", undefined);
    }
    attachMetaUndo({ cols, before, after: snapshotClasses(grid, cols) });
    return hits;
}
