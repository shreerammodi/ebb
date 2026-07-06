/**
 * Chord resolution: turning KeyboardEvent-like objects into canonical chord
 * strings and resolving them against a flat modeless keymap.
 */

import type { CommandId } from "@/lib/commands/registry";

import type { Chord, Keymap } from "./types";

interface KeyEventLike {
    key: string;
    code?: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

/** Physical codes we accept as Alt-chord base keys beyond the letter block. */
const ALT_CODE_KEYS: Record<string, string> = { Backslash: "\\" };

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
 * - Single printable letters: shift encoded in case (uppercase = Shift), driven
 *   by `shiftKey` rather than `e.key`'s case. macOS reports letters lowercase
 *   when Meta is held even with Shift down, so trusting the reported case would
 *   collapse Meta+Shift+P onto Meta+P.
 * - Other single printables (symbols like "?"): key as-is; shift already lives
 *   in the character, never prefixed with Shift+.
 * - Named keys (Tab, Enter, Escape, ArrowUp, etc.): Shift+ added when shiftKey.
 * - Alt chords on macOS: key is composed (Option+H -> "˙"), so we derive from
 *   e.code, which is layout-stable.
 */
export function eventToChord(e: KeyEventLike): Chord {
    // Under Alt, macOS composes e.key (Option+H -> "˙"), so the reported key is
    // unusable for a chord. Derive the base key from the layout-stable e.code.
    let key = e.key;
    if (e.altKey && e.code) {
        const letter = /^Key([A-Z])$/.exec(e.code);
        if (letter) key = letter[1].toLowerCase();
        else if (e.code in ALT_CODE_KEYS) key = ALT_CODE_KEYS[e.code];
    }
    const printable = isSinglePrintable(key);
    const isLetter = printable && /^[a-zA-Z]$/.test(key);
    const parts: string[] = [];
    if (e.metaKey) parts.push("Meta");
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey && !printable) parts.push("Shift");
    if (isLetter) {
        parts.push(e.shiftKey ? key.toUpperCase() : key.toLowerCase());
    } else {
        parts.push(key);
    }
    return parts.join("+");
}

/**
 * Returns the CommandId bound to this chord in the flat keymap, or null.
 */
export function resolveCommand(keymap: Keymap, e: KeyEventLike): CommandId | null {
    const chord = eventToChord(e);
    return keymap.bindings[chord] ?? null;
}
