/**
 * Chord resolution: turning KeyboardEvent-like objects into canonical chord
 * strings and resolving them against a flat modeless keymap.
 */

import type { CommandId } from "@/lib/commands/registry";

import type { Chord, Keymap } from "./types";

interface KeyEventLike {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

/**
 * A printable single character is its own representation; shift is already
 * encoded in its case (e.g. 'O'), so we do NOT prefix Shift+ for these.
 */
function isSinglePrintable(key: string): boolean {
    return key.length === 1;
}

/**
 * Canonical chord string for a key event.
 * Modifier order: Meta+ Ctrl+ Alt+ Shift+ then key.
 *
 * - Single printable chars: key as-is, never prefixed with Shift+.
 * - Named keys (Tab, Enter, Escape, ArrowUp, …): Shift+ added when shiftKey.
 */
export function eventToChord(e: KeyEventLike): Chord {
    const printable = isSinglePrintable(e.key);
    const parts: string[] = [];
    if (e.metaKey) parts.push("Meta");
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey && !printable) parts.push("Shift");
    parts.push(e.key);
    return parts.join("+");
}

/**
 * Returns the CommandId bound to this chord in the flat keymap, or null.
 */
export function resolveCommand(keymap: Keymap, e: KeyEventLike): CommandId | null {
    const chord = eventToChord(e);
    return keymap.bindings[chord] ?? null;
}
