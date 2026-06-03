'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { COMMANDS, type CommandId } from '@/lib/commands/registry';
import { effectiveKeymap } from '@/lib/keymap/effective';
import { eventToChord } from '@/lib/keymap/resolve';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRESETS: { name: 'default' | 'vim'; label: string }[] = [
  { name: 'default', label: 'Default' },
  { name: 'vim', label: 'Vim' },
];

const COMMAND_LIST = Object.values(COMMANDS);

function chordForCommand(bindings: Record<string, CommandId>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [chord, cmd] of Object.entries(bindings)) {
    if (out[cmd] === undefined) out[cmd] = chord;
  }
  return out;
}

export default function SettingsPanel() {
  const open               = useRoundStore(s => s.settingsOpen);
  const keymapName         = useRoundStore(s => s.keymapName);
  const keymapOverrides    = useRoundStore(s => s.keymapOverrides);
  const setKeymapName      = useRoundStore(s => s.setKeymapName);
  const setKeymapOverride  = useRoundStore(s => s.setKeymapOverride);
  const clearKeymapOverride = useRoundStore(s => s.clearKeymapOverride);
  const setSettingsOpen    = useRoundStore(s => s.setSettingsOpen);

  const [recording, setRecording] = useState<CommandId | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setRecording(null); }, [open]);
  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

  const chordByCommand = useMemo(() => {
    const keymap = effectiveKeymap(keymapName, keymapOverrides);
    return chordForCommand(keymap.bindings.normal);
  }, [keymapName, keymapOverrides]);

  if (!open) return null;

  function close() { setSettingsOpen(false); }

  function selectPreset(name: 'default' | 'vim') {
    for (const commandId of Object.keys(keymapOverrides)) {
      clearKeymapOverride(commandId as CommandId);
    }
    setKeymapName(name);
    setRecording(null);
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (recording) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRecording(null); return; }
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const chord = eventToChord({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey });
      setKeymapOverride(recording, chord);
      setRecording(null);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[8vh] bg-black/30 z-[200]"
      onClick={close}
      data-testid="settings-overlay"
    >
      <div
        ref={panelRef}
        className="w-full max-w-[520px] max-h-[84vh] flex flex-col overflow-hidden bg-card border border-border rounded-[var(--radius)] shadow-lg outline-none"
        onClick={e => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard settings"
        data-testid="settings-panel"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-border shrink-0">
          <span className="text-[13px] font-semibold tracking-wide text-zinc-900">Keyboard</span>
          <button
            type="button"
            onClick={close}
            className="text-[13px] text-zinc-400 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded hover:text-zinc-600"
            aria-label="Close settings"
            data-testid="settings-close"
          >
            ✕
          </button>
        </div>

        {/* Preset switcher */}
        <div className="flex gap-1.5 px-3.5 py-2.5 border-b border-border shrink-0" role="group" aria-label="Keymap preset">
          {PRESETS.map(p => {
            const active = p.name === keymapName;
            return (
              <Button
                key={p.name}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                onClick={() => selectPreset(p.name)}
                aria-pressed={active}
                data-testid={`preset-${p.name}`}
              >
                {p.label}
              </Button>
            );
          })}
        </div>

        {/* Command list */}
        <ul className="list-none m-0 p-1.5 overflow-y-auto">
          {COMMAND_LIST.map(cmd => {
            const chord = chordByCommand[cmd.id];
            const overridden = keymapOverrides[cmd.id] !== undefined;
            const isRecording = recording === cmd.id;
            return (
              <li
                key={cmd.id}
                className="grid items-center gap-2.5 px-2 py-1.5 rounded-md"
                style={{ gridTemplateColumns: '1fr auto auto auto' }}
                data-testid={`cmd-${cmd.id}`}
              >
                <span className="text-[13px] text-zinc-900 overflow-hidden text-ellipsis whitespace-nowrap">
                  {cmd.label}
                </span>
                <span
                  className={cn(
                    'font-mono text-[12px] bg-zinc-50 border rounded-md px-1.5 py-0.5 min-w-[64px] text-center whitespace-nowrap',
                    overridden ? 'text-sel border-sel' : 'text-zinc-400 border-zinc-200',
                  )}
                  data-testid={`chord-${cmd.id}`}
                >
                  {isRecording ? 'Press a key…' : chord ?? '—'}
                </span>
                <Button
                  type="button"
                  variant={isRecording ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRecording(isRecording ? null : cmd.id)}
                  data-testid={`record-${cmd.id}`}
                >
                  {isRecording ? 'Cancel' : 'Record'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearKeymapOverride(cmd.id)}
                  disabled={!overridden}
                  data-testid={`reset-${cmd.id}`}
                  aria-label={`Reset ${cmd.label} binding`}
                >
                  Reset
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
