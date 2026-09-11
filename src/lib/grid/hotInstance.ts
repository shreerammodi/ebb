/**
 * Registry for live Handsontable instances. The focused grid remains the
 * command target, while every mounted grid retains the sheet context needed
 * by commands invoked directly from that grid (for example, its context menu).
 */

import type Handsontable from "handsontable";

export interface HotContext {
    mutated: (() => void) | null;
    sheetId: string | null;
    spacers: number;
}

const contexts = new WeakMap<Handsontable, HotContext>();
let active: Handsontable | null = null;
let onMutated: (() => void) | null = null;
let activeSheetId: string | null = null;
let activeSpacers = 0;

/** Retains the sheet context owned by one mounted grid. */
export function registerHot(
    hot: Handsontable,
    mutated: (() => void) | null,
    sheetId: string | null,
    spacers: number,
): void {
    contexts.set(hot, { mutated, sheetId, spacers });
}

/** Returns the context belonging to `hot`, independently of keyboard focus. */
export function getHotContext(hot: Handsontable): HotContext | null {
    return contexts.get(hot) ?? null;
}

/**
 * Marks the focused grid. `spacers` is the pane's inert leading column count:
 * the pane owns it and publishes it here so keyboard commands convert against
 * the number the grid was drawn with.
 */
export function setActiveHot(
    hot: Handsontable | null,
    mutated: (() => void) | null,
    sheetId: string | null,
    spacers: number,
): void {
    active = hot;
    onMutated = mutated;
    activeSheetId = sheetId;
    activeSpacers = spacers;
    if (hot) registerHot(hot, mutated, sheetId, spacers);
}

export function getActiveHot(): Handsontable | null {
    return active;
}

/** The sheet the registered grid is showing, so a command can name it. */
export function getActiveSheetId(): string | null {
    return activeSheetId;
}

/** How many inert leading columns the registered grid is drawing. */
export function getActiveSpacers(): number {
    return activeSpacers;
}

/** Commands call this after writing cell meta so the snapshot/autosave runs. */
export function notifyGridMutated(): void {
    onMutated?.();
}

/**
 * Return keyboard focus to the grid so typing edits the flow and arrows move
 * cells. Overlays call this on close; re-selecting the last cell makes the grid
 * listen again after a dialog stole focus. Returns false when no grid is
 * mounted (e.g. the dashboard) so callers can fall back to default focus.
 */
export function focusActiveHot(): boolean {
    if (!active) return false;
    const sel = active.getSelectedLast();
    // The fallback is the first real column: a spacer stands for a speech this
    // sheet does not hold, so the cursor has no cell to land on there.
    active.selectCell(sel?.[0] ?? 0, sel?.[1] ?? activeSpacers);
    return true;
}
