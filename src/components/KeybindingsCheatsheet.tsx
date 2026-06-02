'use client';

import { useEffect, useRef } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { COMMANDS, type CommandId } from '@/lib/commands/registry';
import { effectiveKeymap } from '@/lib/keymap/useKeymap';

// ─── Command groups ───────────────────────────────────────────────────────────

interface Group {
  label: string;
  rows: { commandId: CommandId; insertMode?: boolean }[];
}

const GROUPS: Group[] = [
  {
    label: 'Navigate',
    rows: [
      { commandId: 'move.up' },
      { commandId: 'move.down' },
      { commandId: 'move.left' },
      { commandId: 'move.right' },
    ],
  },
  {
    label: 'Edit',
    rows: [
      { commandId: 'edit.enter' },
      { commandId: 'edit.exit', insertMode: true },
      { commandId: 'node.addAnswer' },
      { commandId: 'node.answerAcross' },
      { commandId: 'arg.newRoot' },
      { commandId: 'node.delete' },
    ],
  },
  {
    label: 'Status',
    rows: [
      { commandId: 'status.toggleConceded' },
      { commandId: 'status.toggleExtended' },
    ],
  },
  {
    label: 'Sheets',
    rows: [
      { commandId: 'sheet.prev' },
      { commandId: 'sheet.next' },
      { commandId: 'sheet.quickSwitch' },
      { commandId: 'sheet.newAff' },
      { commandId: 'sheet.newNeg' },
      { commandId: 'sheet.rename' },
      { commandId: 'sheet.jump1' },
    ],
  },
  {
    label: 'Timers',
    rows: [
      { commandId: 'timer.toggleSpeech' },
      { commandId: 'timer.togglePrepAff' },
      { commandId: 'timer.togglePrepNeg' },
    ],
  },
  {
    label: 'App',
    rows: [
      { commandId: 'settings.open' },
      { commandId: 'help.open' },
    ],
  },
];

// ─── Chord display ────────────────────────────────────────────────────────────

const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↩',
  Delete: 'Del',
  Backspace: '⌫',
  Tab: '⇥',
};

function prettyChord(chord: string): string {
  return chord
    .split('+')
    .map(part => {
      if (part === 'Meta') return '⌘';
      if (part === 'Ctrl') return '⌃';
      if (part === 'Alt') return '⌥';
      if (part === 'Shift') return '⇧';
      return KEY_LABELS[part] ?? part;
    })
    .join('');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KeybindingsCheatsheet() {
  const open = useRoundStore(s => s.cheatsheetOpen);
  const setCheatsheetOpen = useRoundStore(s => s.setCheatsheetOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const keymap = effectiveKeymap();
  const normalBindings = keymap.bindings.normal;
  const insertBindings = keymap.bindings.insert;

  // Build commandId → chord lookup (first chord wins for display)
  const chordFor: Partial<Record<CommandId, string>> = {};
  for (const [chord, cmd] of Object.entries(normalBindings)) {
    if (!chordFor[cmd as CommandId]) chordFor[cmd as CommandId] = chord;
  }
  for (const [chord, cmd] of Object.entries(insertBindings)) {
    if (!chordFor[cmd as CommandId]) chordFor[cmd as CommandId] = chord;
  }

  function close() {
    setCheatsheetOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  return (
    <div style={styles.overlay} onClick={close} data-testid="cheatsheet-overlay">
      <div
        ref={panelRef}
        className="panel"
        style={styles.panel}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-testid="cheatsheet-panel"
        tabIndex={-1}
      >
        <div style={styles.header}>
          <span style={styles.title}>Keyboard shortcuts</span>
          <button
            type="button"
            onClick={close}
            style={styles.closeBtn}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={styles.body}>
          {GROUPS.map(group => (
            <div key={group.label} style={styles.group}>
              <div style={styles.groupLabel}>{group.label}</div>
              <div style={styles.rows}>
                {group.rows.map(({ commandId, insertMode }) => {
                  const chord = chordFor[commandId];
                  // For jump commands show a condensed range label
                  const isJumpAnchor = commandId === 'sheet.jump1';
                  const displayChord = isJumpAnchor
                    ? prettyChord(chord ?? 'Meta+1').replace('1', '1–9')
                    : chord ? prettyChord(chord) : '—';
                  const label = isJumpAnchor
                    ? 'Jump to sheet 1–9'
                    : COMMANDS[commandId].label;

                  return (
                    <div key={commandId} style={styles.row}>
                      <kbd style={styles.kbd}>{displayChord}</kbd>
                      <span style={styles.desc}>
                        {label}
                        {insertMode && (
                          <span style={styles.modeBadge}>insert</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  } as React.CSSProperties,

  panel: {
    width: '480px',
    maxWidth: '92vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px 10px',
    borderBottom: '1px solid var(--line)',
    flexShrink: 0,
  } as React.CSSProperties,

  title: {
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--ink)',
  } as React.CSSProperties,

  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--muted)',
    fontSize: '14px',
    padding: '2px 6px',
    borderRadius: '4px',
    lineHeight: 1,
  } as React.CSSProperties,

  body: {
    overflowY: 'auto',
    padding: '12px 18px 16px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px 24px',
  } as React.CSSProperties,

  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,

  groupLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '4px',
  } as React.CSSProperties,

  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '26px',
    padding: '1px 5px',
    background: 'var(--bg)',
    border: '1px solid var(--line)',
    borderBottom: '2px solid var(--line)',
    borderRadius: '4px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    color: 'var(--ink)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  desc: {
    fontSize: '12px',
    color: 'var(--ink)',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  } as React.CSSProperties,

  modeBadge: {
    fontSize: '10px',
    color: 'var(--muted)',
    background: 'var(--bg)',
    border: '1px solid var(--line)',
    borderRadius: '3px',
    padding: '0 4px',
    lineHeight: '16px',
  } as React.CSSProperties,
} as const;
