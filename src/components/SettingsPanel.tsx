'use client';

/**
 * SettingsPanel — modal overlay for customizing keybindings.
 *
 * Opens when `settingsOpen` is true. Lets the user:
 *   1. Switch keymap preset (Vim / Excel / Basic) — switching clears overrides.
 *   2. See each command's current chord (from the effective keymap).
 *   3. Record a custom chord for a command (overrides the preset binding).
 *   4. Reset a command back to its preset binding.
 *
 * Escape or the close button dismisses the panel.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { COMMANDS, type CommandId } from '@/lib/commands/registry';
import { effectiveKeymap } from '@/lib/keymap/effective';
import { eventToChord } from '@/lib/keymap/resolve';

const PRESETS: { name: 'vim' | 'excel' | 'basic'; label: string }[] = [
  { name: 'vim', label: 'Vim' },
  { name: 'excel', label: 'Excel' },
  { name: 'basic', label: 'Basic' },
];

const COMMAND_LIST = Object.values(COMMANDS);

/** Builds a CommandId → chord lookup from the effective normal-mode bindings. */
function chordForCommand(bindings: Record<string, CommandId>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [chord, cmd] of Object.entries(bindings)) {
    // First binding wins for display purposes.
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

  // Stop recording whenever the panel closes.
  useEffect(() => {
    if (!open) setRecording(null);
  }, [open]);

  // Focus the panel when it opens so Escape keydown fires on the panel.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const chordByCommand = useMemo(() => {
    const keymap = effectiveKeymap(keymapName, keymapOverrides);
    return chordForCommand(keymap.bindings.normal);
  }, [keymapName, keymapOverrides]);

  if (!open) return null;

  function close() {
    setSettingsOpen(false);
  }

  function selectPreset(name: 'vim' | 'excel' | 'basic') {
    // Clear every override, then switch preset.
    for (const commandId of Object.keys(keymapOverrides)) {
      clearKeymapOverride(commandId as CommandId);
    }
    setKeymapName(name);
    setRecording(null);
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (recording) {
      // Capture the next chord (ignore lone modifier presses).
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setRecording(null);
        return;
      }
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const chord = eventToChord({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
      setKeymapOverride(recording, chord);
      setRecording(null);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  return (
    <div
      style={styles.overlay}
      onClick={close}
      data-testid="settings-overlay"
    >
      <div
        ref={panelRef}
        className="panel"
        style={styles.modal}
        onClick={e => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard settings"
        data-testid="settings-panel"
        tabIndex={-1}
      >
        <div style={styles.header}>
          <span style={styles.title}>Keyboard</span>
          <button
            type="button"
            onClick={close}
            style={styles.closeBtn}
            aria-label="Close settings"
            data-testid="settings-close"
          >
            ✕
          </button>
        </div>

        {/* Preset switcher */}
        <div style={styles.presets} role="group" aria-label="Keymap preset">
          {PRESETS.map(p => {
            const active = p.name === keymapName;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => selectPreset(p.name)}
                aria-pressed={active}
                style={{
                  ...styles.presetBtn,
                  ...(active ? styles.presetBtnActive : null),
                }}
                data-testid={`preset-${p.name}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Command list */}
        <ul style={styles.list}>
          {COMMAND_LIST.map(cmd => {
            const chord = chordByCommand[cmd.id];
            const overridden = keymapOverrides[cmd.id] !== undefined;
            const isRecording = recording === cmd.id;
            return (
              <li key={cmd.id} style={styles.row} data-testid={`cmd-${cmd.id}`}>
                <span style={styles.label}>{cmd.label}</span>
                <span
                  style={{
                    ...styles.chord,
                    ...(overridden ? styles.chordOverridden : null),
                  }}
                  data-testid={`chord-${cmd.id}`}
                >
                  {isRecording ? 'Press a key…' : chord ?? '—'}
                </span>
                <button
                  type="button"
                  onClick={() => setRecording(isRecording ? null : cmd.id)}
                  style={{
                    ...styles.recordBtn,
                    ...(isRecording ? styles.recordBtnActive : null),
                  }}
                  data-testid={`record-${cmd.id}`}
                >
                  {isRecording ? 'Cancel' : 'Record'}
                </button>
                <button
                  type="button"
                  onClick={() => clearKeymapOverride(cmd.id)}
                  disabled={!overridden}
                  style={{
                    ...styles.resetBtn,
                    ...(overridden ? null : styles.resetBtnDisabled),
                  }}
                  data-testid={`reset-${cmd.id}`}
                  aria-label={`Reset ${cmd.label} binding`}
                >
                  Reset
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position:       'fixed',
    inset:          0,
    display:        'flex',
    alignItems:     'flex-start',
    justifyContent: 'center',
    paddingTop:     '8vh',
    background:     'rgba(0, 0, 0, 0.3)',
    zIndex:         200,
  } as React.CSSProperties,

  modal: {
    width:         '100%',
    maxWidth:      '520px',
    maxHeight:     '84vh',
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
  } as React.CSSProperties,

  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '12px 14px',
    borderBottom:   '1px solid var(--line)',
  } as React.CSSProperties,

  title: {
    fontSize:      '13px',
    fontWeight:    600,
    letterSpacing: '0.02em',
    color:         'var(--ink)',
  } as React.CSSProperties,

  closeBtn: {
    font:       'inherit',
    fontSize:   '13px',
    color:      'var(--muted)',
    background: 'transparent',
    border:     'none',
    cursor:     'pointer',
    padding:    '2px 6px',
    lineHeight: 1,
  } as React.CSSProperties,

  presets: {
    display:      'flex',
    gap:          '6px',
    padding:      '10px 14px',
    borderBottom: '1px solid var(--line)',
  } as React.CSSProperties,

  presetBtn: {
    font:         'inherit',
    fontSize:     '13px',
    color:        'var(--ink)',
    background:   'var(--panel)',
    border:       '1px solid var(--line)',
    borderRadius: '6px',
    padding:      '5px 12px',
    cursor:       'pointer',
  } as React.CSSProperties,

  presetBtnActive: {
    color:       '#fff',
    background:  'var(--sel)',
    borderColor: 'var(--sel)',
  } as React.CSSProperties,

  list: {
    listStyle: 'none',
    margin:    0,
    padding:   '6px',
    overflowY: 'auto',
  } as React.CSSProperties,

  row: {
    display:      'grid',
    gridTemplateColumns: '1fr auto auto auto',
    alignItems:   'center',
    gap:          '10px',
    padding:      '6px 8px',
    borderRadius: '6px',
  } as React.CSSProperties,

  label: {
    fontSize:     '13px',
    color:        'var(--ink)',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  } as React.CSSProperties,

  chord: {
    fontFamily:   'var(--mono)',
    fontSize:     '12px',
    color:        'var(--muted)',
    background:   'var(--bg)',
    border:       '1px solid var(--line)',
    borderRadius: '5px',
    padding:      '2px 7px',
    minWidth:     '64px',
    textAlign:    'center',
    whiteSpace:   'nowrap',
  } as React.CSSProperties,

  chordOverridden: {
    color:       'var(--sel)',
    borderColor: 'var(--sel)',
  } as React.CSSProperties,

  recordBtn: {
    font:         'inherit',
    fontSize:     '12px',
    color:        'var(--ink)',
    background:   'var(--panel)',
    border:       '1px solid var(--line)',
    borderRadius: '6px',
    padding:      '4px 10px',
    cursor:       'pointer',
  } as React.CSSProperties,

  recordBtnActive: {
    color:       '#fff',
    background:  'var(--sel)',
    borderColor: 'var(--sel)',
  } as React.CSSProperties,

  resetBtn: {
    font:         'inherit',
    fontSize:     '12px',
    color:        'var(--muted)',
    background:   'transparent',
    border:       '1px solid transparent',
    borderRadius: '6px',
    padding:      '4px 8px',
    cursor:       'pointer',
  } as React.CSSProperties,

  resetBtnDisabled: {
    opacity:       0.4,
    cursor:        'default',
    pointerEvents: 'none',
  } as React.CSSProperties,
} as const;
