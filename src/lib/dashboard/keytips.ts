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
 * Every configurable keytip, as dotted ids. `trigger` is the key that opens the
 * overlay; the rest are grouped by the mode that paints them. The `new.*` ids
 * cover the New-flow menu, including the Public Forum first-speaker submenu.
 */
export type KeytipId =
    | "trigger"
    | "root.new"
    | "root.import"
    | "root.export"
    | "root.trash"
    | "root.search"
    | "root.settings"
    | "root.help"
    | "root.flows"
    | "flows.sort"
    | "flows.group"
    | "new.policyAff"
    | "new.policyNeg"
    | "new.policyJudge"
    | "new.pfAff"
    | "new.pfNeg"
    | "new.pfJudge"
    | "new.ldAff"
    | "new.ldNeg"
    | "new.ldJudge"
    | "new.pfFirstAff"
    | "new.pfFirstNeg";

/**
 * Default chord for every keytip. A chord is unique only within its own group,
 * so `s` (search) at the root and `s` (sort) in the flows context do not clash,
 * and the New-flow menu reuses `a`/`n` in its submenu. `trigger` defaults to
 * `f`; the root flows entry therefore moves to `l` (list) to leave `f` free.
 */
export const DEFAULT_KEYTIPS: Record<KeytipId, string> = {
    trigger: "f",
    "root.new": "n",
    "root.import": "i",
    "root.export": "e",
    "root.trash": "t",
    "root.search": "s",
    "root.settings": ",",
    "root.help": "?",
    "root.flows": "l",
    "flows.sort": "s",
    "flows.group": "t",
    "new.policyAff": "a",
    "new.policyNeg": "n",
    "new.policyJudge": "j",
    "new.pfAff": "f",
    "new.pfNeg": "g",
    "new.pfJudge": "h",
    "new.ldAff": "l",
    "new.ldNeg": "k",
    "new.ldJudge": "d",
    "new.pfFirstAff": "a",
    "new.pfFirstNeg": "n",
};

/** Defaults merged with the user's per-id overrides (empty overrides ignored). */
export function effectiveKeytips(overrides: Record<string, string>): Record<KeytipId, string> {
    const out = { ...DEFAULT_KEYTIPS };
    for (const id of Object.keys(DEFAULT_KEYTIPS) as KeytipId[]) {
        const chord = overrides[id];
        if (typeof chord === "string" && chord.length > 0) out[id] = chord;
    }
    return out;
}

/**
 * Next card index for a roving-focus keypress, or null when `key` is not a
 * navigation key (the caller uses null to mean "not mine, keep looking").
 * Left/Right step one card; Up/Down move a whole grid row (`columns` cards) and
 * stay put when there is no card in that direction; Home/End jump to the ends.
 * `current` of -1 (nothing focused yet) lands on the first card.
 */
export function cardNavTarget(
    current: number,
    count: number,
    key: string,
    columns: number,
): number | null {
    if (count <= 0) return null;
    if (current < 0) return key === "End" ? count - 1 : 0;
    switch (key) {
        case "ArrowLeft":
            return Math.max(0, current - 1);
        case "ArrowRight":
            return Math.min(count - 1, current + 1);
        case "ArrowUp": {
            const up = current - columns;
            return up >= 0 ? up : current;
        }
        case "ArrowDown": {
            const down = current + columns;
            return down < count ? down : current;
        }
        case "Home":
            return 0;
        case "End":
            return count - 1;
        default:
            return null;
    }
}
