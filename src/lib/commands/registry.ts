/**
 * Command registry — the canonical set of commands the keyboard layer can fire.
 *
 * CommandIds are keymap-agnostic: keymaps (vim/excel/basic) bind chords to
 * these ids, and command handlers (commands.ts) implement the behavior.
 */

export type CommandId =
  | 'move.left' | 'move.down' | 'move.up' | 'move.right'
  | 'edit.enter' | 'edit.exit'
  | 'node.addAnswer' | 'node.answerAcross' | 'arg.newRoot'
  | 'node.delete'
  | 'status.toggleConceded' | 'status.toggleExtended'
  | 'sheet.next' | 'sheet.prev' | 'sheet.new' | 'sheet.quickSwitch'
  | 'sheet.jump1' | 'sheet.jump2' | 'sheet.jump3' | 'sheet.jump4' | 'sheet.jump5'
  | 'sheet.jump6' | 'sheet.jump7' | 'sheet.jump8' | 'sheet.jump9'
  | 'settings.open';

export interface CommandDef {
  id: CommandId;
  label: string;
}

export const COMMANDS: Record<CommandId, CommandDef> = {
  'move.left': { id: 'move.left', label: 'Move left (to parent)' },
  'move.down': { id: 'move.down', label: 'Move down' },
  'move.up': { id: 'move.up', label: 'Move up' },
  'move.right': { id: 'move.right', label: 'Move right (to child)' },
  'edit.enter': { id: 'edit.enter', label: 'Edit cell' },
  'edit.exit': { id: 'edit.exit', label: 'Exit edit' },
  'node.addAnswer': { id: 'node.addAnswer', label: 'Add answer (sibling)' },
  'node.answerAcross': { id: 'node.answerAcross', label: 'Answer across (next speech)' },
  'arg.newRoot': { id: 'arg.newRoot', label: 'New root argument' },
  'node.delete': { id: 'node.delete', label: 'Delete node' },
  'status.toggleConceded': { id: 'status.toggleConceded', label: 'Toggle conceded' },
  'status.toggleExtended': { id: 'status.toggleExtended', label: 'Toggle extended' },
  'sheet.next': { id: 'sheet.next', label: 'Next sheet' },
  'sheet.prev': { id: 'sheet.prev', label: 'Previous sheet' },
  'sheet.new': { id: 'sheet.new', label: 'New sheet' },
  'sheet.quickSwitch': { id: 'sheet.quickSwitch', label: 'Quick switch sheet' },
  'sheet.jump1': { id: 'sheet.jump1', label: 'Jump to sheet 1' },
  'sheet.jump2': { id: 'sheet.jump2', label: 'Jump to sheet 2' },
  'sheet.jump3': { id: 'sheet.jump3', label: 'Jump to sheet 3' },
  'sheet.jump4': { id: 'sheet.jump4', label: 'Jump to sheet 4' },
  'sheet.jump5': { id: 'sheet.jump5', label: 'Jump to sheet 5' },
  'sheet.jump6': { id: 'sheet.jump6', label: 'Jump to sheet 6' },
  'sheet.jump7': { id: 'sheet.jump7', label: 'Jump to sheet 7' },
  'sheet.jump8': { id: 'sheet.jump8', label: 'Jump to sheet 8' },
  'sheet.jump9': { id: 'sheet.jump9', label: 'Jump to sheet 9' },
  'settings.open': { id: 'settings.open', label: 'Open settings' },
};
