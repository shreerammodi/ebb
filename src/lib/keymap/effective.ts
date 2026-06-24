/**
 * Effective keymap = preset bindings merged with the user's per-command
 * overrides (normal mode only).
 *
 * An override maps a CommandId to a custom chord. Applying it removes any
 * preset chord(s) that currently fire that command and binds the override
 * chord to it instead.
 */

import { getPresetKeymap, type KeymapName } from "./presets";
import type { Keymap } from "./types";
import type { CommandId } from "@/lib/commands/registry";

export function effectiveKeymap(
  keymapName: KeymapName,
  overrides: Record<string, string>, // commandId → chord
): Keymap {
  const preset = getPresetKeymap(keymapName);
  const normalBindings = { ...preset.bindings.normal };

  for (const [commandId, overrideChord] of Object.entries(overrides)) {
    if (!overrideChord) continue;
    // Remove existing preset chord(s) bound to this command.
    for (const [chord, cmd] of Object.entries(normalBindings)) {
      if (cmd === commandId) delete normalBindings[chord];
    }
    // Bind the override chord.
    normalBindings[overrideChord] = commandId as CommandId;
  }

  return {
    name: `${preset.name}+overrides`,
    bindings: {
      normal: normalBindings,
      insert: { ...preset.bindings.insert },
      move: { ...preset.bindings.move },
    },
  };
}
