/**
 * Native text-editing actions for the chords an OS reserves for editing
 * (undo, redo, select-all, and the modifier+Backspace delete: to the line
 * start on a Mac, the previous word elsewhere).
 *
 * The desktop shell's Edit menu carries these chords as real accelerators and
 * re-dispatches them in JS when one fires (see menuDispatch). That is the only
 * path on macOS, where the OS consumes the accelerator before the webview sees
 * a keydown - but it cannot be the only path on GTK: ebb swaps its menu once
 * at boot (rebuild_menu) and the GTK backend can end up with the replacement
 * accelerators never installed, so an accelerator-driven chord silently does
 * nothing until the next rebuild. The keymap therefore runs the same action
 * itself whenever the keydown reaches it (see useKeymap), which on every
 * platform is exactly the case the menu path did not take.
 */

import { isMacPlatform } from "@/lib/platform";

import { selectAllInElement } from "./intercept";

export type NativeEditAction =
    | "undo"
    | "redo"
    | "deleteToLineStart"
    | "deleteWordBack"
    | "selectAll";

/**
 * The native text-editing action a chord performs while a field is focused,
 * or null when the chord is not one the OS reserves for editing. Mirrors
 * the NATIVE_EDITING_KEYS set in intercept.ts for the chords the menu can
 * carry (Meta+C/V/X belong to the Cut/Copy/Paste predefined items).
 */
export function nativeEditActionFor(chord: string | null): NativeEditAction | null {
    if (!chord) return null;
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    if (chord === `${mod}+z`) return "undo";
    if (chord === `${mod}+Z`) return "redo";
    // The same physical chord means a different edit by platform: the line
    // on a Mac, the previous word on Windows and Linux.
    if (chord === `${mod}+Backspace`)
        return mod === "Meta" ? "deleteToLineStart" : "deleteWordBack";
    if (chord === `${mod}+a`) return "selectAll";
    return null;
}

/**
 * Deletes from the caret back to the start of the line (the native
 * Meta+Backspace behavior) by extending the selection and deleting it via
 * execCommand, which keeps the edit on the field's undo stack.
 */
function deleteToLineStart(el: HTMLElement): void {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
        if (lineStart === start && start === end) return;
        el.setSelectionRange(lineStart, end);
        document.execCommand("delete");
        return;
    }
    const selection = window.getSelection() as
        | (Selection & {
              modify?: (alter: string, direction: string, granularity: string) => void;
          })
        | null;
    if (!selection || selection.rangeCount === 0) return;
    selection.modify?.("extend", "backward", "lineboundary");
    document.execCommand("delete");
}

/**
 * Deletes the word before the caret and the spaces after it (the native
 * Ctrl+Backspace behavior on Windows and Linux), or the selection when there
 * is one, through execCommand so the edit stays on the field's undo stack.
 * Performed here rather than left to the browser because the shell's Delete
 * Row accelerator carries the same chord, and a menu that takes the key first
 * must not delete the row under a debater fixing a typo.
 */
function deleteWordBack(el: HTMLElement): void {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        if (start === end) {
            const before = el.value.slice(0, start);
            const from = before.length - (/\S*\s*$/.exec(before)?.[0].length ?? 0);
            if (from === start) return;
            el.setSelectionRange(from, end);
        }
        document.execCommand("delete");
        return;
    }
    const selection = window.getSelection() as
        | (Selection & {
              modify?: (alter: string, direction: string, granularity: string) => void;
          })
        | null;
    if (!selection || selection.rangeCount === 0) return;
    if (selection.isCollapsed) selection.modify?.("extend", "backward", "word");
    document.execCommand("delete");
}

/**
 * Performs the action `chord` maps to on the focused field, if any.
 *
 * Returns true whenever the chord is one the native-edit layer owns - even
 * when the action had nothing to do (delete-to-line-start at line start) -
 * so callers never fall through to the app command that shares the chord
 * (edit.undo while a field is focused must not run the grid's undo).
 */
export function runNativeEditActionForChord(
    chord: string | null,
    field: HTMLElement | null,
): boolean {
    const action = nativeEditActionFor(chord);
    if (!field || !action) return false;
    if (action === "undo" || action === "redo") {
        document.execCommand(action);
        return true;
    }
    if (action === "deleteToLineStart") {
        deleteToLineStart(field);
        return true;
    }
    if (action === "deleteWordBack") {
        deleteWordBack(field);
        return true;
    }
    selectAllInElement(field);
    return true;
}
