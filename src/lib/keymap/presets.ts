/**
 * Single flat modeless keymap preset.
 *
 * Chord strings are canonical (see resolve.ts / eventToChord). Grid-native
 * gestures (Enter, Alt+Enter, Tab, Esc, arrows) are owned by Handsontable and
 * never appear here; this map holds only app chords.
 */

import type { CommandId } from "@/lib/commands/registry";
import { isMacPlatform } from "@/lib/platform";

import type { Chord, Keymap } from "./types";

/** Platform modifier letter chords: Meta on Mac, Ctrl elsewhere. */
const LETTER_BINDINGS: Record<Chord, CommandId> = (() => {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    return {
        [`${mod}+z`]: "edit.undo",
        [`${mod}+Z`]: "edit.redo",
        [`${mod}+b`]: "format.toggleBold",
        [`${mod}+H`]: "format.toggleHighlight",
        [`${mod}+t`]: "format.toggleCard",
        [`${mod}+g`]: "format.toggleGroup",
        [`${mod}+p`]: "sheet.quickSwitch",
        [`${mod}+P`]: "palette.open",
        [`${mod}+A`]: "sheet.newAff",
        [`${mod}+N`]: "sheet.newNeg",
        [`${mod}+r`]: "sheet.rename",
        [`${mod}+,`]: "settings.open",
        [`${mod}+\\`]: "sidebar.toggle",
        [`${mod}+j`]: "rfd.toggle",
        [`${mod}+Backspace`]: "row.delete",
        [`${mod}+o`]: "cell.insert",
        [`${mod}+Alt+o`]: "cell.insertBelow",
        // Default pushes the current row down; rebind to row.insertBelow in
        // Settings to insert underneath instead.
        [`${mod}+O`]: "row.insertAbove",
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
 * Split-view chords. Toggle stays on Alt+\; pane focus uses the platform
 * modifier + h/l (vim-style). On macOS Meta+h shadows the native "hide app"
 * accelerator, which menu.rs drops so the chord reaches the app.
 */
const SPLIT_BINDINGS: Record<Chord, CommandId> = (() => {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    return {
        "Alt+\\": "split.toggle",
        [`${mod}+h`]: "split.focusLeft",
        [`${mod}+l`]: "split.focusRight",
    };
})();

/** The single flat keymap: sheet switching, formatting, and utility chords. */
export const FLAT_KEYMAP: Keymap = {
    name: "default",
    bindings: {
        "]": "sheet.next",
        "[": "sheet.prev",
        "?": "help.open",
        ...LETTER_BINDINGS,
        ...SHEET_JUMPS,
        ...SPLIT_BINDINGS,
    },
};

// --- Registry ------------------------------------------------------------------

/** Returns the flat preset keymap. */
export function getPresetKeymap(): Keymap {
    return FLAT_KEYMAP;
}
