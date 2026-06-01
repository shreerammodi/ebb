/**
 * Built-in keymap presets: vim, excel, basic.
 *
 * Chord strings are canonical (see resolve.ts / eventToChord).
 */

import type { CommandId } from '@/lib/commands/registry';
import type { Chord, Keymap } from './types';

/** Meta+1 .. Meta+9 → sheet.jump1 .. sheet.jump9 */
const SHEET_JUMPS: Record<Chord, CommandId> = {
  'Meta+1': 'sheet.jump1',
  'Meta+2': 'sheet.jump2',
  'Meta+3': 'sheet.jump3',
  'Meta+4': 'sheet.jump4',
  'Meta+5': 'sheet.jump5',
  'Meta+6': 'sheet.jump6',
  'Meta+7': 'sheet.jump7',
  'Meta+8': 'sheet.jump8',
  'Meta+9': 'sheet.jump9',
};

/** Chords shared across all presets' normal mode. */
const COMMON_NORMAL: Record<Chord, CommandId> = {
  ']': 'sheet.next',
  '[': 'sheet.prev',
  'Meta+k': 'sheet.quickSwitch',
  'Meta+n': 'sheet.new',
  'Meta+,': 'settings.open',
  s: 'timer.toggleSpeech',
  p: 'timer.togglePrepAff',
  P: 'timer.togglePrepNeg',
  ...SHEET_JUMPS,
};

const INSERT_EXIT: Record<Chord, CommandId> = {
  Escape: 'edit.exit',
};

// ─── VIM ──────────────────────────────────────────────────────────────────────

export const VIM_KEYMAP: Keymap = {
  name: 'vim',
  bindings: {
    normal: {
      h: 'move.left',
      j: 'move.down',
      k: 'move.up',
      l: 'move.right',
      i: 'edit.enter',
      Enter: 'edit.enter',
      o: 'node.addAnswer',
      a: 'node.answerAcross',
      O: 'arg.newRoot',
      c: 'status.toggleConceded',
      e: 'status.toggleExtended',
      x: 'node.delete',
      ...COMMON_NORMAL,
    },
    insert: { ...INSERT_EXIT },
  },
};

// ─── EXCEL ────────────────────────────────────────────────────────────────────

export const EXCEL_KEYMAP: Keymap = {
  name: 'excel',
  bindings: {
    normal: {
      ArrowLeft: 'move.left',
      ArrowDown: 'move.down',
      ArrowUp: 'move.up',
      ArrowRight: 'move.right',
      Enter: 'edit.enter',
      F2: 'edit.enter',
      Tab: 'node.answerAcross',
      'Alt+Enter': 'arg.newRoot',
      Delete: 'node.delete',
      ...COMMON_NORMAL,
    },
    insert: { ...INSERT_EXIT },
  },
};

// ─── BASIC ────────────────────────────────────────────────────────────────────

export const BASIC_KEYMAP: Keymap = {
  name: 'basic',
  bindings: {
    normal: {
      ArrowLeft: 'move.left',
      ArrowDown: 'move.down',
      ArrowUp: 'move.up',
      ArrowRight: 'move.right',
      Enter: 'edit.enter',
      Delete: 'node.delete',
      ...COMMON_NORMAL,
    },
    insert: { ...INSERT_EXIT },
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export type KeymapName = 'vim' | 'excel' | 'basic';

export const KEYMAPS: Record<KeymapName, Keymap> = {
  vim: VIM_KEYMAP,
  excel: EXCEL_KEYMAP,
  basic: BASIC_KEYMAP,
};

/** Returns the preset keymap for a name. */
export function getPresetKeymap(name: KeymapName): Keymap {
  return KEYMAPS[name];
}
