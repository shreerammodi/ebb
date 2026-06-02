'use client';

/**
 * RoundHeader — top header bar.
 *
 * Shows the round participants based on the user's role:
 *   - aff / neg: "Aff vs <opponent>"
 *   - judge:     "<affName> (Aff) vs <negName> (Neg)"
 *
 * Includes a "New round" button that resets the store to RoundSetup.
 * Also includes Export, Import, and Print buttons (Task 18).
 */

import { useRef } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { downloadRoundFile, readRoundFile } from '@/lib/persistence/io';

export default function RoundHeader() {
  const round = useRoundStore(s => s.round);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!round) return null;

  const { role, meta } = round;

  let participants: string;
  if (role === 'judge') {
    const aff = meta.affName?.trim() || 'Aff';
    const neg = meta.negName?.trim() || 'Neg';
    participants = `${aff} (Aff) vs ${neg} (Neg)`;
  } else {
    const opponent = meta.opponent?.trim() || 'Opponent';
    participants = `Aff vs ${opponent}`;
  }

  function handleNewRound() {
    useRoundStore.setState({
      round: null,
      activeSheetId: null,
      selection: null,
      mode: 'normal',
    });
  }

  function handleExport() {
    const r = useRoundStore.getState().round;
    if (r) downloadRoundFile(r);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readRoundFile(file);
      useRoundStore.setState({ round: imported, activeSheetId: null, selection: null, mode: 'normal' });
    } catch {
      alert('Failed to import: file may be invalid or from an incompatible version.');
    }
    // Reset so the same file can be re-imported
    e.target.value = '';
  }

  function handlePrint() {
    window.print();
  }

  return (
    <header style={styles.header} data-testid="round-header">
      <span style={styles.participants}>{participants}</span>
      <div className="no-print" style={styles.controls}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="Import round file"
          style={{ display: 'none' }}
          onChange={handleImportChange}
          data-testid="import-file-input"
        />
        <button
          style={styles.actionBtn}
          onClick={handleExport}
          data-testid="export-btn"
        >
          Export
        </button>
        <button
          style={styles.actionBtn}
          onClick={handleImportClick}
          data-testid="import-btn"
        >
          Import
        </button>
        <button
          style={styles.actionBtn}
          onClick={handlePrint}
          data-testid="print-btn"
        >
          Print
        </button>
        <button
          style={styles.newRoundBtn}
          onClick={handleNewRound}
          data-testid="new-round-btn"
        >
          New round
        </button>
      </div>
    </header>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    height:         '48px',
    padding:        '0 16px',
    background:     'var(--panel)',
    borderBottom:   '1px solid var(--line)',
    flex:           '0 0 auto',
  } as React.CSSProperties,

  participants: {
    fontSize:   '14px',
    fontWeight: 600,
    color:      'var(--ink)',
  } as React.CSSProperties,

  controls: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  } as React.CSSProperties,

  actionBtn: {
    fontSize:     '12px',
    fontWeight:   500,
    color:        'var(--muted)',
    background:   'transparent',
    border:       '1px solid var(--line)',
    borderRadius: '4px',
    padding:      '4px 10px',
    cursor:       'pointer',
  } as React.CSSProperties,

  newRoundBtn: {
    fontSize:     '12px',
    fontWeight:   500,
    color:        'var(--muted)',
    background:   'transparent',
    border:       '1px solid var(--line)',
    borderRadius: '4px',
    padding:      '4px 10px',
    cursor:       'pointer',
  } as React.CSSProperties,
} as const;
