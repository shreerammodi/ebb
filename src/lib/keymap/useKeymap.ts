'use client';

import { useEffect } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import { effectiveKeymap as computeEffectiveKeymap } from './effective';
import { resolveCommand, eventToChord } from './resolve';

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

// Module-level accumulator — safe because useKeymap is a singleton hook.
let pendingPrefix: string | null = null;

export function useKeymap(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const keymap = effectiveKeymap();
      const { mode } = useRoundStore.getState();

      const editable = isEditableTarget(e.target);
      // In an editable field, only allow Escape (edit.exit) through.
      // Also clear any pending chord prefix so it doesn't get stuck.
      if (editable) {
        pendingPrefix = null;
        if (e.key !== 'Escape') return;
      }

      const chord = eventToChord({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey });
      const modeBindings = keymap.bindings[mode] ?? {};

      // ── Two-key chord resolution ─────────────────────────────────────────────
      if (pendingPrefix !== null) {
        const twoKey = `${pendingPrefix} ${chord}`;
        if (twoKey in modeBindings) {
          pendingPrefix = null;
          e.preventDefault();
          executeCommand(modeBindings[twoKey]);
          return;
        }
        // Prefix didn't complete — clear and fall through to single-chord lookup.
        pendingPrefix = null;
      }

      // Check whether this chord is a valid prefix for any two-key sequence.
      const isPrefix = Object.keys(modeBindings).some(k => k.startsWith(`${chord} `));
      if (isPrefix) {
        pendingPrefix = chord;
        e.preventDefault();
        return;
      }

      // ── Single-chord resolution ──────────────────────────────────────────────
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
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      pendingPrefix = null; // clear on unmount
    };
  }, []);
}
