/**
 * displayChord: turns a CommandId into a human-readable key hint.
 *
 * Single source of truth for key rendering, shared by the keybindings
 * cheatsheet and the Guide. Reads the live keymap so hints reflect user remaps.
 */

import type { CommandId } from "@/lib/commands/registry";

import { GRAB_BINDINGS } from "./presets";
import { effectiveKeymap } from "./useKeymap";

const KEY_LABELS: Record<string, string> = {
    Escape: "Esc",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "↩",
    Delete: "Del",
    Backspace: "⌫",
    Tab: "⇥",
};

export function prettyChord(chord: string): string {
    return chord
        .split("+")
        .map((part) => {
            if (part === "Meta") return "⌘";
            if (part === "Ctrl") return "⌃";
            if (part === "Alt") return "⌥";
            if (part === "Shift") return "⇧";
            return KEY_LABELS[part] ?? part;
        })
        .join("");
}

/** CommandId → first bound chord, including grab-mode sub-bindings. */
export function buildChordMap(): Partial<Record<CommandId, string>> {
    const keymap = effectiveKeymap();
    const map: Partial<Record<CommandId, string>> = {};
    for (const [chord, cmd] of Object.entries(keymap.bindings)) {
        if (!map[cmd as CommandId]) map[cmd as CommandId] = chord;
    }
    // Grab sub-state bindings (commit/cancel) live outside the flat map.
    for (const [chord, cmd] of Object.entries(GRAB_BINDINGS)) {
        if (!map[cmd as CommandId]) map[cmd as CommandId] = chord;
    }
    return map;
}

/** Pretty key hint for a command, or null when the command is unbound. */
export function keyHintFor(commandId: CommandId): string | null {
    const chord = buildChordMap()[commandId];
    return chord ? prettyChord(chord) : null;
}
