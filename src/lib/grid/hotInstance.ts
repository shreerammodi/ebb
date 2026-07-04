/**
 * Registry for the single live Handsontable instance. Command handlers reach
 * the grid through this module so lib/commands stays import-safe in tests and
 * on routes where no grid is mounted.
 */

import type Handsontable from "handsontable";

let active: Handsontable | null = null;
let onMutated: (() => void) | null = null;

/** HotGrid registers its instance (and snapshot callback) on mount, null on unmount. */
export function setActiveHot(hot: Handsontable | null, mutated?: (() => void) | null): void {
    active = hot;
    onMutated = mutated ?? null;
}

export function getActiveHot(): Handsontable | null {
    return active;
}

/** Commands call this after writing cell meta so the snapshot/autosave runs. */
export function notifyGridMutated(): void {
    onMutated?.();
}
