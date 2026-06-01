import type { CommandId } from '@/lib/commands/registry';

export type Mode = 'normal' | 'insert';

/**
 * Canonical chord string for a key event.
 * Format: "Meta+Ctrl+Alt+Shift+key" (modifiers in that fixed order, only
 * those present), e.g. "Meta+k", "Shift+Tab", "j".
 */
export type Chord = string;

export interface Keymap {
  name: string;
  bindings: Record<Mode, Record<Chord, CommandId>>;
}
