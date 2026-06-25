/**
 * Built-in keymap presets: default, vim.
 *
 * Chord strings are canonical (see resolve.ts / eventToChord).
 */

import type { CommandId } from "@/lib/commands/registry";
import type { Chord, Keymap } from "./types";

/** Ctrl+1 .. Ctrl+9 → sheet.jump1 .. sheet.jump9 */
const SHEET_JUMPS: Record<Chord, CommandId> = {
    "Ctrl+1": "sheet.jump1",
    "Ctrl+2": "sheet.jump2",
    "Ctrl+3": "sheet.jump3",
    "Ctrl+4": "sheet.jump4",
    "Ctrl+5": "sheet.jump5",
    "Ctrl+6": "sheet.jump6",
    "Ctrl+7": "sheet.jump7",
    "Ctrl+8": "sheet.jump8",
    "Ctrl+9": "sheet.jump9",
};

/** Chords shared across all presets' normal mode. */
const COMMON_NORMAL: Record<Chord, CommandId> = {
    "Ctrl+b": "format.toggleBold",
    "Ctrl+z": "edit.undo",
    "Ctrl+Shift+z": "edit.redo",
    "]": "sheet.next",
    "[": "sheet.prev",
    "Ctrl+k": "sheet.quickSwitch",
    "Ctrl+a": "sheet.newAff",
    "Ctrl+n": "sheet.newNeg",
    "Ctrl+r": "sheet.rename",
    "Ctrl+,": "settings.open",
    "?": "help.open",
    ...SHEET_JUMPS,
};

// ─── DEFAULT ──────────────────────────────────────────────────────────────────
//
// Always-insert mode: cells are editable immediately on selection, no modality.
// Arrow keys navigate between cells even while a cell is focused.
// Ctrl+ shortcuts work from anywhere.

/**
 * Move mode (keyboard grab & move): arrows steer the target cursor spatially,
 * Enter drops, Escape cancels. Shared across presets; vim adds hjkl.
 */
const MOVE_COMMON: Record<Chord, CommandId> = {
    ArrowLeft: "move.left",
    ArrowDown: "move.down",
    ArrowUp: "move.up",
    ArrowRight: "move.right",
    Enter: "move.commit",
    Escape: "move.cancel",
};

export const DEFAULT_KEYMAP: Keymap = {
    name: "default",
    bindings: {
        normal: {
            ArrowLeft: "move.left",
            ArrowDown: "move.down",
            ArrowUp: "move.up",
            ArrowRight: "move.right",
            Enter: "node.addAnswer",
            "Shift+Enter": "node.answerAcross",
            "Alt+Enter": "arg.newRoot",
            Tab: "nav.nextSpeech",
            "Shift+Tab": "nav.prevSpeech",
            "Ctrl+Shift+x": "status.toggleConceded",
            "Ctrl+e": "status.toggleExtended",
            // Bare letters type into always-editable cells, so grab is a chord.
            "Ctrl+m": "move.grab",
            Delete: "node.delete",
            ...COMMON_NORMAL,
        },
        insert: {},
        move: MOVE_COMMON,
    },
};

// ─── VIM ──────────────────────────────────────────────────────────────────────

export const VIM_KEYMAP: Keymap = {
    name: "vim",
    bindings: {
        normal: {
            h: "move.left",
            j: "move.down",
            k: "move.up",
            l: "move.right",
            i: "edit.enter",
            Enter: "edit.enter",
            o: "node.addAnswer",
            a: "node.answerAcross",
            O: "arg.newRoot",
            c: "status.toggleConceded",
            e: "status.toggleExtended",
            x: "node.delete",
            m: "move.grab",
            "g r": "sheet.rename",
            ...COMMON_NORMAL,
        },
        insert: { Escape: "edit.exit", Enter: "node.addAnswer", Tab: "nav.nextSpeech", "Shift+Tab": "nav.prevSpeech" },
        move: {
            h: "move.left",
            j: "move.down",
            k: "move.up",
            l: "move.right",
            ...MOVE_COMMON,
        },
    },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export type KeymapName = "default" | "vim";

export const KEYMAPS: Record<KeymapName, Keymap> = {
    default: DEFAULT_KEYMAP,
    vim: VIM_KEYMAP,
};

/** Returns the preset keymap for a name. */
export function getPresetKeymap(name: KeymapName): Keymap {
    return KEYMAPS[name];
}
