/**
 * Focus-aware dispatch for native menu commands.
 *
 * Menu items carry real accelerators (see src-tauri/src/menu.rs), and macOS
 * consumes an accelerator chord before the webview sees a keydown. For chords
 * the OS reserves for text editing (undo, redo, select-all,
 * delete-to-line-start), the menu event therefore re-creates the native
 * editing behavior whenever a text field is focused; the app command runs
 * only when one is not. The re-dispatch decision follows the command's current
 * chord in the effective keymap, so rebinding a command on or off a native
 * editing chord moves the behavior with it.
 */

import { executeCommand } from "@/lib/commands/commands";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { isMacPlatform } from "@/lib/platform";

import { chordForCommand } from "./accelerator";
import { isTextEntryFocus, selectAllInElement } from "./intercept";
import { effectiveKeymap } from "./useKeymap";

/** Menu id of the Select All item. Not a CommandId; there is no app command. */
export const SELECT_ALL_MENU_ID = "selectAll";

/** The focused element, when it is a text-entry field; null otherwise. */
function focusedTextEntry(): HTMLElement | null {
    const el = document.activeElement;
    return el instanceof HTMLElement && isTextEntryFocus(el) ? el : null;
}

type NativeEditAction = "undo" | "redo" | "deleteToLineStart" | "selectAll";

/**
 * The native text-editing action a chord performs while a field is focused,
 * or null when the chord is not one the OS reserves for editing. Mirrors
 * the NATIVE_EDITING_KEYS set in intercept.ts for the chords the menu can
 * carry (Meta+C/V/X belong to the Cut/Copy/Paste predefined items).
 */
function nativeEditActionFor(chord: string | null): NativeEditAction | null {
    if (!chord) return null;
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    if (chord === `${mod}+z`) return "undo";
    if (chord === `${mod}+Z`) return "redo";
    if (chord === `${mod}+Backspace`) return "deleteToLineStart";
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

export function dispatchMenuCommand(id: string): void {
    if (id === SELECT_ALL_MENU_ID) {
        selectAllInElement(focusedTextEntry());
        return;
    }
    if (!(id in COMMANDS)) return;
    const commandId = id as CommandId;
    const field = focusedTextEntry();
    if (field) {
        const action = nativeEditActionFor(chordForCommand(effectiveKeymap(), commandId));
        if (action === "undo" || action === "redo") {
            document.execCommand(action);
            return;
        }
        if (action === "deleteToLineStart") {
            deleteToLineStart(field);
            return;
        }
        if (action === "selectAll") {
            selectAllInElement(field);
            return;
        }
    }
    executeCommand(commandId);
}
