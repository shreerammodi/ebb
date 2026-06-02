'use client';

import { useRef, useState, useEffect } from 'react';
import { useRoundStore, selectSheetsByGroup, selectSheetDropCount } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import type { Sheet } from '@/lib/model/types';

interface GroupConfig {
  group: 'aff' | 'neg';
  label: string;
}

const GROUPS: GroupConfig[] = [
  { group: 'aff', label: 'Aff' },
  { group: 'neg', label: 'Neg' },
];

export default function Sidebar() {
  const round            = useRoundStore(s => s.round);
  const activeSheetId    = useRoundStore(s => s.activeSheetId);
  const setActiveSheet   = useRoundStore(s => s.setActiveSheet);
  const renamingSheetId  = useRoundStore(s => s.renamingSheetId);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);

  if (!round) return null;

  return (
    <nav style={styles.sidebar} aria-label="Sheets" data-testid="sidebar" className="no-print">
      <div style={styles.scroll}>
        {GROUPS.map(({ group, label }) => {
          const sheets = selectSheetsByGroup(round, group);
          return (
            <div key={group} style={styles.group}>
              <div className="label" style={styles.groupHeader}>{label}</div>
              {sheets.length === 0 ? (
                <div className="muted" style={styles.empty}>No sheets</div>
              ) : (
                sheets.map(sheet => (
                  <SheetRow
                    key={sheet.id}
                    sheet={sheet}
                    dropCount={selectSheetDropCount(round, sheet.id)}
                    active={sheet.id === activeSheetId}
                    onSelect={() => setActiveSheet(sheet.id)}
                    isRenaming={sheet.id === renamingSheetId}
                    onStartRename={() => setRenamingSheet(sheet.id)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.addBtns}>
        <button
          type="button"
          className="btn"
          style={styles.addBtn}
          onClick={() => executeCommand('sheet.newAff')}
          data-testid="add-aff"
        >
          + Aff
        </button>
        <button
          type="button"
          className="btn"
          style={styles.addBtn}
          onClick={() => executeCommand('sheet.newNeg')}
          data-testid="add-neg"
        >
          + Neg
        </button>
      </div>
    </nav>
  );
}

// ─── Sheet row ────────────────────────────────────────────────────────────────

interface SheetRowProps {
  sheet: Sheet;
  dropCount: number;
  active: boolean;
  onSelect: () => void;
  isRenaming: boolean;
  onStartRename: () => void;
}

function SheetRow({ sheet, dropCount, active, onSelect, isRenaming, onStartRename }: SheetRowProps) {
  const renameSheet      = useRoundStore(s => s.renameSheet);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(sheet.title);

  useEffect(() => {
    if (isRenaming) {
      setValue(sheet.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, sheet.title]);

  function commit() {
    renameSheet(sheet.id, value.trim() || sheet.title);
    setRenamingSheet(null);
  }

  function cancel() {
    setRenamingSheet(null);
  }

  const rowStyle = {
    ...styles.sheetRow,
    ...(active ? styles.sheetRowActive : null),
  };

  if (isRenaming) {
    return (
      <div style={rowStyle}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.stopPropagation(); commit(); }
            if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
          }}
          onBlur={commit}
          style={styles.renameInput}
          data-testid={`rename-input-${sheet.id}`}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      aria-current={active ? 'true' : undefined}
      data-testid={`sheet-${sheet.id}`}
      style={rowStyle}
    >
      <span style={styles.sheetTitle}>{sheet.title}</span>
      {dropCount > 0 && (
        <span className="badge-drop" data-testid={`drop-badge-${sheet.id}`}>
          {dropCount}
        </span>
      )}
    </button>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  sidebar: {
    display:       'flex',
    flexDirection: 'column',
    width:         '220px',
    flex:          '0 0 220px',
    height:        '100%',
    background:    'var(--panel)',
    borderRight:   '1px solid var(--line)',
  } as React.CSSProperties,

  scroll: {
    flex:      '1 1 auto',
    overflowY: 'auto',
    padding:   '8px',
  } as React.CSSProperties,

  group: {
    marginBottom: '12px',
  } as React.CSSProperties,

  groupHeader: {
    padding: '6px 8px 4px',
  } as React.CSSProperties,

  empty: {
    padding:  '4px 8px',
    fontSize: '12px',
  } as React.CSSProperties,

  sheetRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            '6px',
    width:          '100%',
    textAlign:      'left',
    font:           'inherit',
    fontSize:       '13px',
    color:          'var(--ink)',
    background:     'transparent',
    borderWidth:    '1px',
    borderStyle:    'solid',
    borderColor:    'transparent',
    borderRadius:   '6px',
    padding:        '6px 8px',
    cursor:         'pointer',
  } as React.CSSProperties,

  sheetRowActive: {
    background:  'var(--bg)',
    borderColor: 'var(--line)',
    fontWeight:  600,
  } as React.CSSProperties,

  sheetTitle: {
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  } as React.CSSProperties,

  renameInput: {
    flex:         '1 1 auto',
    font:         'inherit',
    fontSize:     '13px',
    color:        'var(--ink)',
    background:   'transparent',
    border:       'none',
    outline:      '1px solid var(--aff)',
    borderRadius: '3px',
    padding:      '0 2px',
    width:        '100%',
  } as React.CSSProperties,

  addBtns: {
    display: 'flex',
    gap:     '4px',
    margin:  '8px',
    flex:    '0 0 auto',
  } as React.CSSProperties,

  addBtn: {
    flex: '1 1 0',
  } as React.CSSProperties,
} as const;
