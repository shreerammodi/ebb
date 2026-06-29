/**
 * Single flat modeless keymap preset.
 *
 * Chord strings are canonical (see resolve.ts / eventToChord).
 * There is no vim/move mode layer — one binding map for everything.
 * Grab-move is handled by a transient override in useKeymap.
 */

import type { CommandId } from "@/lib/commands/registry";
import { isMacPlatform } from "@/lib/platform";

import type { Chord, Keymap } from "./types";

/**
 * Excel-style data-edge jumps. Directional jumps use the platform modifier
 * (Cmd on Mac, Ctrl elsewhere); corner jumps use Ctrl+Home/End on all platforms
 * (Home/End aren't system-reserved, unlike Ctrl+Arrow on macOS).
 */
const JUMP_BINDINGS: Record<Chord, CommandId> = (() => {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    return {
        [`${mod}+ArrowUp`]: "nav.jumpUp",
        [`${mod}+ArrowDown`]: "nav.jumpDown",
        [`${mod}+ArrowLeft`]: "nav.jumpLeft",
        [`${mod}+ArrowRight`]: "nav.jumpRight",
        "Ctrl+Home": "nav.jumpHome",
        "Ctrl+End": "nav.jumpEnd",
    };
})();

/** Platform modifier letter chords: Meta on Mac, Ctrl elsewhere. */
const LETTER_BINDINGS: Record<Chord, CommandId> = (() => {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    return {
        [`${mod}+m`]: "move.grab",
        [`${mod}+z`]: "edit.undo",
        [`${mod}+Z`]: "edit.redo",
        [`${mod}+b`]: "format.toggleBold",
        [`${mod}+H`]: "format.toggleHighlight",
        // Cmd/Ctrl+Shift+X (the uppercase "X" chord encodes Shift). Kept off the
        // bare Cmd/Ctrl+X so it doesn't collide with the native cut chord, which
        // passes through inside the always-focused cell editor.
        [`${mod}+X`]: "status.toggleConceded",
        [`${mod}+e`]: "status.toggleExtended",
        [`${mod}+k`]: "sheet.quickSwitch",
        [`${mod}+p`]: "palette.open",
        [`${mod}+a`]: "sheet.newAff",
        [`${mod}+n`]: "sheet.newNeg",
        [`${mod}+r`]: "sheet.rename",
        [`${mod}+,`]: "settings.open",
        [`${mod}+\\`]: "sidebar.toggle",
        [`${mod}+Backspace`]: "row.delete",
        [`${mod}+Shift+Backspace`]: "node.deleteSubtree",
    };
})();

/** Sheet jumps: Meta+1-9 on Mac, Ctrl+1-9 elsewhere. */
const SHEET_JUMPS: Record<Chord, CommandId> = (() => {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    return {
        [`${mod}+1`]: "sheet.jump1",
        [`${mod}+2`]: "sheet.jump2",
        [`${mod}+3`]: "sheet.jump3",
        [`${mod}+4`]: "sheet.jump4",
        [`${mod}+5`]: "sheet.jump5",
        [`${mod}+6`]: "sheet.jump6",
        [`${mod}+7`]: "sheet.jump7",
        [`${mod}+8`]: "sheet.jump8",
        [`${mod}+9`]: "sheet.jump9",
    };
})();

/**
 * The single flat keymap. All navigation, creation, and utility chords live
 * here. During a grab-move (moveSource !== null), Enter/Escape are temporarily
 * overridden to move.commit / move.cancel by the useKeymap hook.
 */
export const FLAT_KEYMAP: Keymap = {
    name: "default",
    bindings: {
        // ── Navigation ────────────────────────────────────────────────────────
        ArrowLeft: "move.left",
        ArrowDown: "move.down",
        ArrowUp: "move.up",
        ArrowRight: "move.right",
        Tab: "move.right",
        "Shift+Tab": "move.left",
        ...JUMP_BINDINGS,

        // ── Node creation ─────────────────────────────────────────────────────
        Enter: "node.sibling",
        "Shift+Enter": "node.response",

        // ── Cell operations ───────────────────────────────────────────────────
        Delete: "cell.clear",

        // ── Platform modifier chords (Meta on Mac, Ctrl elsewhere) ─────────
        ...LETTER_BINDINGS,

        // ── Sheets ────────────────────────────────────────────────────────────
        "]": "sheet.next",
        "[": "sheet.prev",
        "?": "help.open",
        ...SHEET_JUMPS,
    },
};

/**
 * Grab-move override bindings. When moveSource is active, these chords take
 * priority over the flat keymap for the duration of the grab.
 */
export const GRAB_BINDINGS: Record<Chord, CommandId> = {
    Enter: "move.commit",
    Escape: "move.cancel",
};

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Returns the flat preset keymap. */
export function getPresetKeymap(): Keymap {
    return FLAT_KEYMAP;
}
