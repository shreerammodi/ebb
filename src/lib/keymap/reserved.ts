/**
 * Reserved chords — browser/OS shortcuts that must be intercepted at the
 * capture phase so they never reach the browser's shortcut handler.
 *
 * The capture-phase listener in useKeymap calls preventDefault() + stopPropagation()
 * for any chord in this set, guaranteeing the app's keybindings win.
 *
 * Platform-conditional: on macOS the browser reserves Meta (Cmd) chords;
 * on Windows/Linux it reserves Ctrl chords. Mirrors the isMacPlatform()
 * pattern used in presets.ts for directional jumps.
 */

import { isMacPlatform } from "@/lib/platform";

/**
 * The base set of keys that, when combined with the platform's primary
 * modifier (Meta on Mac, Ctrl elsewhere), are reserved by the browser/OS.
 *
 * This is derived from the letter/number/symbol chords used in FLAT_KEYMAP —
 * we only need to reserve chords we actually bind (or are likely to bind).
 */
const RESERVED_KEYS = [
    // ── Sheets ─────────────────────────────────────────────────────────────
    "a", // new aff
    "n", // new neg
    "r", // rename
    "k", // quick switch
    // ── Edit ───────────────────────────────────────────────────────────────
    "z", // undo (Ctrl+z / Meta+z)
    // ── Format / status ────────────────────────────────────────────────────
    "b", // toggle bold
    "x", // toggle conceded
    "e", // toggle extended
    // ── UI ─────────────────────────────────────────────────────────────────
    "\\", // sidebar toggle
    ",", // settings
    // ── Row / node operations ──────────────────────────────────────────────
    "Backspace", // row delete
    // ── Sheet jumps ────────────────────────────────────────────────────────
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
] as const;

/**
 * Chords to intercept at the capture phase. On Mac these are Meta+key;
 * on Windows/Linux they are Ctrl+key.
 *
 * Also includes Ctrl+Shift+Backspace (delete subtree) and Ctrl+Shift+Z (redo)
 * since those use Shift as a secondary modifier on the platform modifier.
 */
export function reservedChords(): Set<string> {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    const chords = new Set<string>();

    for (const key of RESERVED_KEYS) {
        chords.add(`${mod}+${key}`);
    }

    // Secondary-modifier chords. Backspace is a named key so Shift+ is explicit;
    // Z is a single printable so uppercase encodes the shift (eventToChord rule).
    chords.add(`${mod}+Shift+Backspace`);
    chords.add(`${mod}+Z`);

    return chords;
}
