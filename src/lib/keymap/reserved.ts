/**
 * Reserved chords - browser/OS shortcuts that must be intercepted at the
 * capture phase so they never reach the browser's shortcut handler.
 *
 * The capture-phase listener in useKeymap calls preventDefault() for any
 * chord in this set, guaranteeing the app's keybindings win.
 *
 * Platform-conditional: on macOS the browser reserves Meta chords;
 * on Windows/Linux it reserves Ctrl chords.
 */

import { isMacPlatform } from "@/lib/platform";

/**
 * The base set of keys that, when combined with the platform's primary
 * modifier (Meta on Mac, Ctrl elsewhere), are reserved by the browser/OS.
 * Derived from the chords FLAT_KEYMAP actually binds.
 */
const RESERVED_KEYS = [
    // -- Sheets ------------------------------------------------------------
    "a", // new aff
    "n", // new neg
    "r", // rename
    "p", // search palette (also suppresses browser print)
    "P", // command palette (Shift encoded in uppercase key)
    // -- Edit ----------------------------------------------------------------
    "z", // undo (Ctrl+z / Meta+z)
    // -- Format ----------------------------------------------------------------
    "b", // toggle bold
    "H", // toggle highlight (Shift encoded in uppercase key)
    "t", // toggle card
    "g", // toggle group (suppresses browser find-next)
    // -- UI ---------------------------------------------------------------------
    "\\", // sidebar toggle
    ",", // settings
    "j", // rfd toggle
    "h", // focus left pane (suppresses mac hide-app / win-linux browser history)
    "l", // focus right pane
    // -- Rows / cells -------------------------------------------------------
    "Backspace", // row delete
    "o", // insert cell (suppresses browser open-file)
    "O", // insert row (Shift encoded in uppercase key)
    // -- Sheet jumps -----------------------------------------------------------
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
 * on Windows/Linux they are Ctrl+key. Includes Meta/Ctrl+Shift+Z (redo),
 * whose shift rides in the uppercase key per the eventToChord rule.
 */
export function reservedChords(): Set<string> {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    const chords = new Set<string>();

    for (const key of RESERVED_KEYS) {
        chords.add(`${mod}+${key}`);
    }
    chords.add(`${mod}+Z`);

    return chords;
}
