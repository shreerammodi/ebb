"use client";

import { useEffect } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { executeCommand } from "@/lib/commands/commands";
import { effectiveKeymap as computeEffectiveKeymap } from "./effective";
import { resolveCommand, eventToChord } from "./resolve";

/** Returns the keymap currently in effect: preset merged with user overrides. */
export function effectiveKeymap() {
  const { keymapName, keymapOverrides } = useRoundStore.getState();
  return computeEffectiveKeymap(keymapName, keymapOverrides);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

// Module-level accumulator — safe because useKeymap is a singleton hook.
let pendingPrefix: string | null = null;

export function useKeymap(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const keymap = effectiveKeymap();
      const { mode, moveSource } = useRoundStore.getState();
      const moveActive = moveSource !== null;

      // In move mode cells aren't editable, so route every key to the 'move' map
      // (don't let the editable-typing filter swallow Enter/Escape/letters).
      const editable = !moveActive && isEditableTarget(e.target);
      if (editable) {
        pendingPrefix = null;
        const { keymapName } = useRoundStore.getState();
        if (keymapName === "default") {
          // Allow arrow-key navigation and modifier chords (Meta+k etc.) through.
          // Everything else is regular typing and should not be intercepted.
          const isNavKey = [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Tab",
            "Enter",
          ].includes(e.key);
          const isModifierChord = e.metaKey || e.ctrlKey || e.altKey;
          if (!isNavKey && !isModifierChord) return;
        } else {
          // Vim: only allow Escape (edit.exit) through.
          if (e.key !== "Escape") return;
        }
      }

      const chord = eventToChord({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
      // Default keymap is always-insert: navigation bindings only exist in 'normal'.
      // Using the raw `mode` here would silently drop all commands when mode='insert'.
      const { keymapName } = useRoundStore.getState();
      const effectiveMode = moveActive ? "move" : keymapName === "default" ? "normal" : mode;
      const modeBindings = keymap.bindings[effectiveMode] ?? {};

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
      const isPrefix = Object.keys(modeBindings).some((k) => k.startsWith(`${chord} `));
      if (isPrefix) {
        pendingPrefix = chord;
        e.preventDefault();
        return;
      }

      // ── Single-chord resolution ──────────────────────────────────────────────
      // Use effectiveMode (not raw mode) for the same reason as the prefix path:
      // the default keymap is always-insert, so its navigation bindings live in
      // 'normal'. Passing raw 'insert' here would drop every command after a
      // cell is created (which sets mode='insert').
      const commandId = resolveCommand(keymap, effectiveMode, {
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

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      pendingPrefix = null; // clear on unmount
    };
  }, []);
}
