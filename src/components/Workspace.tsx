'use client';

/**
 * Workspace — main layout shell for an active round.
 *
 * Composes the header (top), sidebar (left) and the FlowGrid for the active
 * sheet (right). The QuickSwitcher overlay and the modal keymap hook are
 * mounted here too. The FlowGrid is only rendered when a sheet is active.
 */

import { useEffect } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { useKeymap } from '@/lib/keymap/useKeymap';
import RoundHeader from './RoundHeader';
import Sidebar from './Sidebar';
import QuickSwitcher from './QuickSwitcher';
import SettingsPanel from './SettingsPanel';
import KeybindingsCheatsheet from './KeybindingsCheatsheet';
import FlowGrid from './FlowGrid';
import PrintView from './PrintView';

export default function Workspace() {
  useKeymap();

  const activeSheetId = useRoundStore(s => s.activeSheetId);

  // Auto-select the first node when switching sheets, so movement keys work immediately.
  useEffect(() => {
    const { round, selection, mode } = useRoundStore.getState();
    if (!activeSheetId || !round || mode === 'insert') return;
    if (selection?.sheetId === activeSheetId && selection.nodeId !== '') return;

    const sheetNodes = round.nodes
      .filter(n => n.sheetId === activeSheetId)
      .sort((a, b) => {
        const colA = round.format.speeches.findIndex(s => s.id === a.speechId);
        const colB = round.format.speeches.findIndex(s => s.id === b.speechId);
        return colA !== colB ? colA - colB : a.order - b.order;
      });

    if (sheetNodes.length > 0) {
      const first = sheetNodes[0];
      useRoundStore.getState().setSelection({
        sheetId: first.sheetId,
        speechId: first.speechId,
        nodeId: first.id,
      });
    } else {
      useRoundStore.getState().setSelection(null);
    }
  }, [activeSheetId]);

  return (
    <div style={styles.root} data-testid="workspace">
      <RoundHeader />
      <div style={styles.body}>
        <Sidebar />
        <main style={styles.content} data-testid="workspace-content">
          {activeSheetId ? (
            <FlowGrid sheetId={activeSheetId} />
          ) : (
            <div className="muted" style={styles.empty}>
              No sheet selected
            </div>
          )}
        </main>
      </div>
      <QuickSwitcher />
      <SettingsPanel />
      <KeybindingsCheatsheet />
      <PrintView />
    </div>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100vh',
    background:    'var(--bg)',
  } as React.CSSProperties,

  body: {
    display:  'flex',
    flex:     '1 1 auto',
    minHeight: 0,
  } as React.CSSProperties,

  content: {
    flex:      '1 1 auto',
    minWidth:  0,
    overflow:  'auto',
    padding:   '16px',
  } as React.CSSProperties,

  empty: {
    padding:  '24px',
    fontSize: '13px',
  } as React.CSSProperties,
} as const;
