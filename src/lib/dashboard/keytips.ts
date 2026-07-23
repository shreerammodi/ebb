/**
 * Dashboard KeyTips - an Excel-style keyboard overlay that paints the key for
 * every actionable control. `off` hides every tip; the other modes name the
 * group of tips currently painted and handled.
 *
 * The dashboard is the only screen without the flow editor's command palette,
 * so it is the only place this layer lives. Pure state/navigation math sits
 * here; the React wiring is under `components/dashboard/keytips`.
 */
export type KeyTipMode = "off" | "root" | "flows" | "new";

/** Every mode except `off`; the groups a KeyTip can belong to. */
export type KeyTipGroup = Exclude<KeyTipMode, "off">;

/**
 * The mode Escape returns to: one level up toward the root, bottoming out at
 * `off`. `new` is owned by the Base UI menu, so it also unwinds to `root`.
 */
export function keyTipParent(mode: KeyTipMode): KeyTipMode {
    switch (mode) {
        case "flows":
        case "new":
            return "root";
        default:
            return "off";
    }
}

/**
 * Next card index for a roving-focus keypress, or null when `key` is not a
 * navigation key (the caller uses null to mean "not mine, keep looking").
 * Movement is linear across the grid (Left/Up = previous, Right/Down = next);
 * Home/End jump to the ends. The result is clamped to [0, count), so pressing
 * past an edge stays put. `current` of -1 (nothing focused yet) lands on the
 * first card for any step.
 */
export function cardNavTarget(current: number, count: number, key: string): number | null {
    if (count <= 0) return null;
    switch (key) {
        case "ArrowLeft":
        case "ArrowUp":
            return current < 0 ? 0 : Math.max(0, current - 1);
        case "ArrowRight":
        case "ArrowDown":
            return current < 0 ? 0 : Math.min(count - 1, current + 1);
        case "Home":
            return 0;
        case "End":
            return count - 1;
        default:
            return null;
    }
}
