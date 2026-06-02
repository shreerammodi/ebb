'use client';

/**
 * Workspace — main layout shell for an active round.
 *
 * Composes the header (top), sidebar (left) and the FlowGrid for the active
 * sheet (right). The QuickSwitcher overlay and the modal keymap hook are
 * mounted here too. The FlowGrid is only rendered when a sheet is active.
 */

import { useRoundStore } from '@/lib/store/useRoundStore';
import { useKeymap } from '@/lib/keymap/useKeymap';
import RoundHeader from './RoundHeader';
import Sidebar from './Sidebar';
import QuickSwitcher from './QuickSwitcher';
import SettingsPanel from './SettingsPanel';
import FlowGrid from './FlowGrid';
import PrintView from './PrintView';

export default function Workspace() {
  useKeymap();

  const activeSheetId = useRoundStore(s => s.activeSheetId);

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
