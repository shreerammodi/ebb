/**
 * Unified key-interception predicate.
 *
 * The capture-phase and bubble-phase listeners in useKeymap both call
 * `shouldIntercept`, so they can never diverge (the root cause of the
 * Cmd+A-in-text-box bug).
 *
 * Rule:
 *   - If the chord is a native editing chord (Cmd/Ctrl+A, C, V, X, Z, Shift+Z)
 *     AND focus is in a text box → do NOT intercept (let the browser handle it).
 *   - Otherwise, if the chord is in reservedChords → intercept.
 *   - Otherwise → do not intercept.
 */

import { isMacPlatform } from "@/lib/platform";

import { reservedChords } from "./reserved";
import { eventToChord } from "./resolve";

/**
 * Native editing chords that must pass through to the browser when the user
 * is typing in a text box. These are the chords that the OS reserves for
 * text editing: select-all, copy, paste, cut, undo, redo.
 *
 * On macOS these are Meta+; on Windows/Linux they are Ctrl+.
 */
const NATIVE_EDITING_KEYS = [
    "a", // select all
    "c", // copy
    "v", // paste
    "x", // cut
    "z", // undo
] as const;

let cachedNativeEditingChords: Set<string> | null = null;

/**
 * Returns the set of native editing chords for the current platform.
 * Includes both Cmd+Z (undo) and Cmd+Shift+Z / Cmd+Z (redo, shift variant).
 */
function nativeEditingChords(): Set<string> {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    const chords = new Set<string>();
    for (const key of NATIVE_EDITING_KEYS) {
        chords.add(`${mod}+${key}`);
    }
    // Redo: Cmd+Shift+Z on Mac, Ctrl+Shift+Z on Windows/Linux.
    // eventToChord encodes shift in the case of single printables (Z, not z),
    // so the redo chord is Meta+Z / Ctrl+Z (uppercase), matching eventToChord output.
    // We don't add a Shift+ prefix here.
    chords.add(`${mod}+Z`);
    return chords;
}

/**
 * Returns true if the given key event is a native editing chord
 * (select-all, copy, paste, cut, undo, redo) on the current platform.
 * Does NOT consider focus — the caller must check isTextEntryFocus separately.
 */
export function isNativeEditingChord(e: KeyboardEvent): boolean {
    if (!cachedNativeEditingChords) {
        cachedNativeEditingChords = nativeEditingChords();
    }
    const chord = eventToChord({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
    });
    return cachedNativeEditingChords.has(chord);
}

/**
 * Returns true if the event target is a text-entry field where native
 * editing chords should pass through.
 *
 * Text-entry focus = a chrome <input>, any <textarea> (including the grid's
 * cell-input), or a contentEditable element. The optional `data-native-keys`
 * attribute is an escape hatch for any future chrome element that needs full
 * native key behavior.
 */
export function isTextEntryFocus(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    if (target.isContentEditable) return true;
    // Escape hatch: explicit opt-in for any element.
    if (target.dataset.nativeKeys === "true") return true;
    return false;
}

/**
 * The unified interception predicate. Both the capture-phase and
 * bubble-phase listeners call this so they can never disagree.
 *
 * Returns true if the event should be intercepted (preventDefault + handled
 * by the app's keymap). Returns false if the event should be left alone.
 */
export function shouldIntercept(e: KeyboardEvent): boolean {
    // If it's a native editing chord and the user is typing in a text box,
    // let the browser handle it (select-all, copy, paste, cut, undo, redo).
    if (isNativeEditingChord(e) && isTextEntryFocus(e.target)) {
        return false;
    }

    // Otherwise, intercept if it's a reserved chord.
    const chord = eventToChord({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
    });
    return reservedChords().has(chord);
}
