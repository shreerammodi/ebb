/**
 * Built-in keymap presets: default, vim.
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
  'Meta+a': 'sheet.newAff',
  'Meta+n': 'sheet.newNeg',
  'Meta+r': 'sheet.rename',
  'Meta+,': 'settings.open',
  s: 'timer.toggleSpeech',
  p: 'timer.togglePrepAff',
  P: 'timer.togglePrepNeg',
  '?': 'help.open',
  ...SHEET_JUMPS,
};

// ─── DEFAULT ──────────────────────────────────────────────────────────────────
//
// Always-insert mode: cells are editable immediately on selection, no modality.
// Arrow keys navigate between cells even while a cell is focused.
// Meta+ shortcuts work from anywhere.

export const DEFAULT_KEYMAP: Keymap = {
  name: 'default',
  bindings: {
    normal: {
      ArrowLeft: 'move.left',
      ArrowDown: 'move.down',
      ArrowUp: 'move.up',
      ArrowRight: 'move.right',
      Tab: 'node.answerAcross',
      'Alt+Enter': 'arg.newRoot',
      Delete: 'node.delete',
      ...COMMON_NORMAL,
    },
    insert: {},
  },
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
      'g r': 'sheet.rename',
      ...COMMON_NORMAL,
    },
    insert: { Escape: 'edit.exit' },
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export type KeymapName = 'default' | 'vim';

export const KEYMAPS: Record<KeymapName, Keymap> = {
  default: DEFAULT_KEYMAP,
  vim: VIM_KEYMAP,
};

/** Returns the preset keymap for a name. */
export function getPresetKeymap(name: KeymapName): Keymap {
  return KEYMAPS[name];
}
