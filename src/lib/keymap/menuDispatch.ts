/**
 * Focus-aware dispatch for native menu commands.
 *
 * Menu items carry real accelerators (see src-tauri/src/menu.rs), and macOS
 * consumes an accelerator chord before the webview sees a keydown. For chords
 * the OS reserves for text editing (undo, redo, select-all,
 * delete-to-line-start), the menu event therefore re-creates the native
 * editing behavior whenever a text field is focused; the app command runs
 * only when one is not.
 */

import { executeCommand } from "@/lib/commands/commands";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";

import { isTextEntryFocus, selectAllInElement } from "./intercept";

/** Menu id of the Select All item. Not a CommandId; there is no app command. */
export const SELECT_ALL_MENU_ID = "selectAll";

/** The focused element, when it is a text-entry field; null otherwise. */
function focusedTextEntry(): HTMLElement | null {
    const el = document.activeElement;
    return el instanceof HTMLElement && isTextEntryFocus(el) ? el : null;
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
 * Runs a menu:command payload: native text editing for the focus-dependent
 * chords while a text field is focused, the app command otherwise.
 */
export function dispatchMenuCommand(id: string): void {
    if (id === SELECT_ALL_MENU_ID) {
        selectAllInElement(focusedTextEntry());
        return;
    }
    const field = focusedTextEntry();
    if (field) {
        if (id === "edit.undo") {
            document.execCommand("undo");
            return;
        }
        if (id === "edit.redo") {
            document.execCommand("redo");
            return;
        }
        if (id === "row.delete") {
            deleteToLineStart(field);
            return;
        }
    }
    if (id in COMMANDS) executeCommand(id as CommandId);
}
