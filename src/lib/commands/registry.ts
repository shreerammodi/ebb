/**
 * Command registry — the canonical set of commands the keyboard layer can fire.
 *
 * CommandIds are keymap-agnostic: keymaps bind chords to these ids, and
 * command handlers (commands.ts) implement the behavior.
 *
 * The grid is fully modeless — no normal/insert/move mode layers.
 */

export type CommandId =
    | "move.left"
    | "move.down"
    | "move.up"
    | "move.right"
    | "node.sibling"
    | "node.response"
    | "row.insertAbove"
    | "row.insertBelow"
    | "row.delete"
    | "cell.clear"
    | "node.deleteSubtree"
    | "move.grab"
    | "move.commit"
    | "move.cancel"
    | "edit.undo"
    | "edit.redo"
    | "status.toggleConceded"
    | "status.toggleExtended"
    | "format.toggleBold"
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
    | "nav.nextSpeech"
    | "nav.prevSpeech";

export interface CommandDef {
    id: CommandId;
    label: string;
}

export const COMMANDS: Record<CommandId, CommandDef> = {
    "move.left": { id: "move.left", label: "Move left" },
    "move.down": { id: "move.down", label: "Move down" },
    "move.up": { id: "move.up", label: "Move up" },
    "move.right": { id: "move.right", label: "Move right" },
    "node.sibling": { id: "node.sibling", label: "Spawn sibling below" },
    "node.response": { id: "node.response", label: "Spawn response across" },
    "row.insertAbove": { id: "row.insertAbove", label: "Insert row above" },
    "row.insertBelow": { id: "row.insertBelow", label: "Insert row below" },
    "row.delete": { id: "row.delete", label: "Delete row" },
    "cell.clear": { id: "cell.clear", label: "Clear cell" },
    "node.deleteSubtree": {
        id: "node.deleteSubtree",
        label: "Delete subtree",
    },
    "move.grab": { id: "move.grab", label: "Grab to move" },
    "move.commit": { id: "move.commit", label: "Drop here" },
    "move.cancel": { id: "move.cancel", label: "Cancel move" },
    "edit.undo": { id: "edit.undo", label: "Undo" },
    "edit.redo": { id: "edit.redo", label: "Redo" },
    "status.toggleConceded": {
        id: "status.toggleConceded",
        label: "Toggle conceded",
    },
    "status.toggleExtended": {
        id: "status.toggleExtended",
        label: "Toggle extended",
    },
    "format.toggleBold": { id: "format.toggleBold", label: "Toggle bold" },
    "sheet.next": { id: "sheet.next", label: "Next sheet" },
    "sheet.prev": { id: "sheet.prev", label: "Previous sheet" },
    "sheet.newAff": { id: "sheet.newAff", label: "New aff sheet" },
    "sheet.newNeg": { id: "sheet.newNeg", label: "New neg sheet" },
    "sheet.rename": { id: "sheet.rename", label: "Rename active sheet" },
    "sheet.quickSwitch": {
        id: "sheet.quickSwitch",
        label: "Quick switch sheet",
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
    "nav.nextSpeech": { id: "nav.nextSpeech", label: "Next speech (column)" },
    "nav.prevSpeech": { id: "nav.prevSpeech", label: "Previous speech (column)" },
};
