/**
 * Command registry — the canonical set of commands the keyboard layer can fire.
 *
 * CommandIds are keymap-agnostic: keymaps (vim/excel/basic) bind chords to
 * these ids, and command handlers (commands.ts) implement the behavior.
 */

export type CommandId =
  | "move.left"
  | "move.down"
  | "move.up"
  | "move.right"
  | "edit.enter"
  | "edit.exit"
  | "edit.undo"
  | "edit.redo"
  | "node.addAnswer"
  | "node.answerAcross"
  | "arg.newRoot"
  | "node.delete"
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
  | "timer.toggleSpeech"
  | "timer.togglePrepAff"
  | "timer.togglePrepNeg"
  | "help.open"
  | "group.withBelow"
  | "group.ungroup";

export interface CommandDef {
  id: CommandId;
  label: string;
}

export const COMMANDS: Record<CommandId, CommandDef> = {
  "move.left": { id: "move.left", label: "Move left (to parent)" },
  "move.down": { id: "move.down", label: "Move down" },
  "move.up": { id: "move.up", label: "Move up" },
  "move.right": { id: "move.right", label: "Move right (to child)" },
  "edit.enter": { id: "edit.enter", label: "Edit cell" },
  "edit.exit": { id: "edit.exit", label: "Exit edit" },
  "edit.undo": { id: "edit.undo", label: "Undo" },
  "edit.redo": { id: "edit.redo", label: "Redo" },
  "node.addAnswer": { id: "node.addAnswer", label: "Add answer (sibling)" },
  "node.answerAcross": { id: "node.answerAcross", label: "Answer across (next speech)" },
  "arg.newRoot": { id: "arg.newRoot", label: "New root argument" },
  "node.delete": { id: "node.delete", label: "Delete node" },
  "status.toggleConceded": { id: "status.toggleConceded", label: "Toggle conceded" },
  "status.toggleExtended": { id: "status.toggleExtended", label: "Toggle extended" },
  "format.toggleBold": { id: "format.toggleBold", label: "Toggle bold" },
  "sheet.next": { id: "sheet.next", label: "Next sheet" },
  "sheet.prev": { id: "sheet.prev", label: "Previous sheet" },
  "sheet.newAff": { id: "sheet.newAff", label: "New aff sheet" },
  "sheet.newNeg": { id: "sheet.newNeg", label: "New neg sheet" },
  "sheet.rename": { id: "sheet.rename", label: "Rename active sheet" },
  "sheet.quickSwitch": { id: "sheet.quickSwitch", label: "Quick switch sheet" },
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
  "timer.toggleSpeech": { id: "timer.toggleSpeech", label: "Toggle speech timer" },
  "timer.togglePrepAff": { id: "timer.togglePrepAff", label: "Toggle aff prep timer" },
  "timer.togglePrepNeg": { id: "timer.togglePrepNeg", label: "Toggle neg prep timer" },
  "help.open": { id: "help.open", label: "Show keybindings" },
  "group.withBelow": { id: "group.withBelow", label: "Group with node below" },
  "group.ungroup": { id: "group.ungroup", label: "Remove from group" },
};
