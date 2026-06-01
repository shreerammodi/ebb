'use client';

/**
 * QuickSwitcher — modal overlay for jumping between sheets.
 *
 * Opens when `quickSwitcherOpen` is true. A text input fuzzy-filters sheets by
 * title (case-insensitive substring). Selecting a sheet (click or Enter) sets it
 * active and closes; Escape closes without selecting.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';

export default function QuickSwitcher() {
  const open             = useRoundStore(s => s.quickSwitcherOpen);
  const round            = useRoundStore(s => s.round);
  const setActiveSheet   = useRoundStore(s => s.setActiveSheet);
  const setOpen          = useRoundStore(s => s.setQuickSwitcherOpen);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the query and focus the input each time the switcher opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus after paint so the input is mounted.
      inputRef.current?.focus();
    }
  }, [open]);

  const sheets = round?.sheets;

  const filtered = useMemo(() => {
    const all = sheets ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter(s => s.title.toLowerCase().includes(q)) : all;
  }, [sheets, query]);

  if (!open) return null;

  function select(sheetId: string) {
    setActiveSheet(sheetId);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const first = filtered[0];
      if (first) select(first.id);
    }
  }

  return (
    <div
      style={styles.overlay}
      onClick={() => setOpen(false)}
      data-testid="quick-switcher-overlay"
    >
      <div
        className="panel"
        style={styles.modal}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        data-testid="quick-switcher"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Jump to sheet…"
          style={styles.input}
          data-testid="quick-switcher-input"
          aria-label="Filter sheets"
        />
        <ul style={styles.list}>
          {filtered.length === 0 ? (
            <li className="muted" style={styles.empty}>No matching sheets</li>
          ) : (
            filtered.map(sheet => (
              <li key={sheet.id}>
                <button
                  type="button"
                  style={styles.item}
                  onClick={() => select(sheet.id)}
                  data-testid={`qs-sheet-${sheet.id}`}
                >
                  {sheet.title}
                </button>
              </li>
            ))
          )}
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
    paddingTop:     '12vh',
    background:     'rgba(0, 0, 0, 0.3)',
    zIndex:         100,
  } as React.CSSProperties,

  modal: {
    width:    '100%',
    maxWidth: '420px',
    overflow: 'hidden',
  } as React.CSSProperties,

  input: {
    width:        '100%',
    font:         'inherit',
    fontSize:     '14px',
    color:        'var(--ink)',
    background:   'var(--panel)',
    border:       'none',
    borderBottom: '1px solid var(--line)',
    padding:      '12px 14px',
    boxSizing:    'border-box',
  } as React.CSSProperties,

  list: {
    listStyle: 'none',
    margin:    0,
    padding:   '6px',
    maxHeight: '50vh',
    overflowY: 'auto',
  } as React.CSSProperties,

  empty: {
    padding:  '8px 10px',
    fontSize: '13px',
  } as React.CSSProperties,

  item: {
    display:      'block',
    width:        '100%',
    textAlign:    'left',
    font:         'inherit',
    fontSize:     '13px',
    color:        'var(--ink)',
    background:   'transparent',
    border:       'none',
    borderRadius: '6px',
    padding:      '8px 10px',
    cursor:       'pointer',
  } as React.CSSProperties,
} as const;
