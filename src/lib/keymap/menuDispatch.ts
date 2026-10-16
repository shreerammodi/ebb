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
import { COMMANDS, GRID_SCOPED, type CommandId } from "@/lib/commands/registry";

import { chordForCommand } from "./accelerator";
import { isGridEditorFocus, isTextEntryFocus, selectAllInElement } from "./intercept";
import { runNativeEditActionForChord } from "./nativeEdit";
import { effectiveKeymap } from "./useKeymap";

/** Menu id of the Select All item. Not a CommandId; there is no app command. */
export const SELECT_ALL_MENU_ID = "selectAll";

/** Pathname of the flow screen, the only route where useKeymap and the palette mount. */
const FLOW_ROUTE = "/flow";

/**
 * Commands safe to run from any route. Everything else touches the in-memory
 * round (sheets, cells, panels) or persists a flow-only display setting, so off
 * the flow screen that state is absent or stale: running them would mutate a
 * round that isn't showing, persist a setting nobody can see change, or latch a
 * panel open for the next flow load.
 *
 * The flow.* commands belong here because they are exactly the ones the start
 * screen needs, and each already no-ops when no flow is open. window.new and
 * window.close belong here for the same reason in reverse: neither is
 * flow-scoped at all. collab.join joins them because it takes a code and opens
 * the flow it fetches, which is a route onto the flow screen rather than an
 * edit to a round already there - and the start screen is exactly where a
 * guest with a code is standing.
 */
const GLOBAL_COMMANDS = new Set<CommandId>([
    "window.new",
    "window.close",
    "flow.new",
    "flow.open",
    "flow.save",
    "flow.saveAs",
    "flow.reveal",
    "flow.close",
    "settings.open",
    "theme.light",
    "theme.dark",
    "theme.system",
    "collab.join",
]);

/** True when the current route is not the flow screen and the command is flow-scoped. */
function isBlockedOffFlow(id: CommandId): boolean {
    return window.location.pathname !== FLOW_ROUTE && !GLOBAL_COMMANDS.has(id);
}

/** The focused element, when it is a text-entry field; null otherwise. */
function focusedTextEntry(): HTMLElement | null {
    const el = document.activeElement;
    return el instanceof HTMLElement && isTextEntryFocus(el) ? el : null;
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
        // A chord the OS reserves for editing performs that edit while a text
        // field is focused; only the chord's current owner decides it (see
        // nativeEdit.ts).
        const chord = chordForCommand(effectiveKeymap(), commandId);
        if (runNativeEditActionForChord(chord, field)) return;
    }
    // On macOS a menu accelerator is consumed before the webview's keydown, so
    // a formatting chord typed into chrome arrives here rather than through
    // useKeymap. Same rule: the box in front owns the chord, not the grid
    // behind it, and the grid's own cell editor is the exception.
    if (field && !isGridEditorFocus(field) && GRID_SCOPED[commandId]) return;
    if (isBlockedOffFlow(commandId)) return;
    executeCommand(commandId);
}
