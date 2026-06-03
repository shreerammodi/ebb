'use client';

import { useEffect, useRef, useState } from 'react';
import type { Round } from '@/lib/model/types';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { downloadRoundFile } from '@/lib/persistence/io';
import { downloadXlsx } from '@/lib/export/xlsx';
import { downloadPdf } from '@/lib/export/pdf';

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(fn: (round: Round) => unknown | Promise<unknown>) {
    const round = useRoundStore.getState().round;
    if (!round) return;
    setOpen(false);
    try {
      await fn(round);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return (
    <div ref={rootRef} style={styles.root} className="no-print">
      <button
        style={styles.actionBtn}
        onClick={() => setOpen(o => !o)}
        data-testid="export-btn"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export ▾
      </button>
      {open && (
        <div role="menu" style={styles.menu}>
          <button role="menuitem" style={styles.item} data-testid="export-json" onClick={() => run(r => downloadRoundFile(r))}>
            JSON
          </button>
          <button role="menuitem" style={styles.item} data-testid="export-excel" onClick={() => run(r => downloadXlsx(r))}>
            Excel
          </button>
          <button role="menuitem" style={styles.item} data-testid="export-pdf" onClick={() => run(r => downloadPdf(r))}>
            PDF
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { position: 'relative', display: 'inline-block' } as React.CSSProperties,
  actionBtn: {
    fontSize: '12px', fontWeight: 500, color: 'var(--muted)', background: 'transparent',
    border: '1px solid var(--line)', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer',
  } as React.CSSProperties,
  menu: {
    position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: '120px',
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '4px', zIndex: 20, display: 'flex', flexDirection: 'column',
  } as React.CSSProperties,
  item: {
    fontSize: '12px', textAlign: 'left', color: 'var(--ink)', background: 'transparent',
    border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer',
  } as React.CSSProperties,
} as const;
