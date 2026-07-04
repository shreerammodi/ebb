/**
 * Command registry - the canonical set of commands the keyboard layer can fire.
 *
 * CommandIds are keymap-agnostic: keymaps bind chords to these ids, and
 * command handlers (commands.ts) implement the behavior. Grid-native gestures
 * (Enter, Tab, Esc, arrows, cell editing) are owned by Handsontable and are
 * not commands; the cheatsheet lists them as fixed keys.
 */

export type CommandId =
    | "edit.undo"
    | "edit.redo"
    | "format.toggleBold"
    | "format.toggleHighlight"
    | "row.insertAbove"
    | "row.insertBelow"
    | "row.delete"
    | "sheet.next"
    | "sheet.prev"
    | "sheet.newAff"
    | "sheet.newNeg"
    | "sheet.rename"
    | "sheet.quickSwitch"
    | "sheet.jump1"
    | "sheet.jump2"
    | "sheet.jump3"
    | "sheet.jump4"
    | "sheet.jump5"
    | "sheet.jump6"
    | "sheet.jump7"
    | "sheet.jump8"
    | "sheet.jump9"
    | "settings.open"
    | "info.open"
    | "help.open"
    | "sidebar.toggle"
    | "palette.open";

export interface CommandDef {
    id: CommandId;
    label: string;
}

export const COMMANDS: Record<CommandId, CommandDef> = {
    "edit.undo": { id: "edit.undo", label: "Undo" },
    "edit.redo": { id: "edit.redo", label: "Redo" },
    "format.toggleBold": { id: "format.toggleBold", label: "Toggle bold" },
    "format.toggleHighlight": {
        id: "format.toggleHighlight",
        label: "Toggle highlight",
    },
    "row.insertAbove": { id: "row.insertAbove", label: "Insert row above" },
    "row.insertBelow": { id: "row.insertBelow", label: "Insert row below" },
    "row.delete": { id: "row.delete", label: "Delete row" },
    "sheet.next": { id: "sheet.next", label: "Next sheet" },
    "sheet.prev": { id: "sheet.prev", label: "Previous sheet" },
    "sheet.newAff": { id: "sheet.newAff", label: "New aff sheet" },
    "sheet.newNeg": { id: "sheet.newNeg", label: "New neg sheet" },
    "sheet.rename": { id: "sheet.rename", label: "Rename active sheet" },
    "sheet.quickSwitch": {
        id: "sheet.quickSwitch",
        label: "Search cells",
    },
    "sheet.jump1": { id: "sheet.jump1", label: "Jump to sheet 1" },
    "sheet.jump2": { id: "sheet.jump2", label: "Jump to sheet 2" },
    "sheet.jump3": { id: "sheet.jump3", label: "Jump to sheet 3" },
    "sheet.jump4": { id: "sheet.jump4", label: "Jump to sheet 4" },
    "sheet.jump5": { id: "sheet.jump5", label: "Jump to sheet 5" },
    "sheet.jump6": { id: "sheet.jump6", label: "Jump to sheet 6" },
    "sheet.jump7": { id: "sheet.jump7", label: "Jump to sheet 7" },
    "sheet.jump8": { id: "sheet.jump8", label: "Jump to sheet 8" },
    "sheet.jump9": { id: "sheet.jump9", label: "Jump to sheet 9" },
    "settings.open": { id: "settings.open", label: "Open settings" },
    "info.open": { id: "info.open", label: "Open round info" },
    "help.open": { id: "help.open", label: "Show keybindings" },
    "sidebar.toggle": { id: "sidebar.toggle", label: "Toggle sidebar" },
    "palette.open": { id: "palette.open", label: "Command palette" },
};
