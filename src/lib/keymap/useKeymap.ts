'use client';

/**
 * Modal keyboard hook.
 *
 * Attaches a window keydown listener that resolves the active keymap (chosen
 * by `keymapName` in the store) and fires the matched command. Cleans up on
 * unmount.
 *
 * When focus is inside an editable element (input / textarea / contenteditable)
 * only Escape is honored (so the user can leave insert mode); all other keys
 * are left to the field.
 */

import { useEffect } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import { effectiveKeymap as computeEffectiveKeymap } from './effective';
import { resolveCommand } from './resolve';

/** Returns the keymap currently in effect: preset merged with user overrides. */
export function effectiveKeymap() {
  const { keymapName, keymapOverrides } = useRoundStore.getState();
  return computeEffectiveKeymap(keymapName, keymapOverrides);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeymap(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const keymap = effectiveKeymap();
      const { mode } = useRoundStore.getState();

      const editable = isEditableTarget(e.target);
      // In an editable field, only allow Escape (edit.exit) through.
      if (editable && e.key !== 'Escape') return;

      const commandId = resolveCommand(keymap, mode, {
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
      if (!commandId) return;

      e.preventDefault();
      executeCommand(commandId);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
