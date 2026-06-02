'use client';

/**
 * Sidebar — left sheet list.
 *
 * Groups sheets into "Case" first, then "Off-case". Each sheet shows its title
 * and, if it has dropped arguments, a `.badge-drop` count. Clicking a sheet
 * makes it active; the active sheet is highlighted. An "+ Add sheet" button at
 * the bottom appends a new off-case sheet.
 */

import { useRoundStore, selectSheetsByGroup, selectSheetDropCount } from '@/lib/store/useRoundStore';
import type { Sheet } from '@/lib/model/types';

interface GroupConfig {
  group: 'case' | 'offcase';
  label: string;
}

const GROUPS: GroupConfig[] = [
  { group: 'case', label: 'Case' },
  { group: 'offcase', label: 'Off-case' },
];

export default function Sidebar() {
  const round          = useRoundStore(s => s.round);
  const activeSheetId  = useRoundStore(s => s.activeSheetId);
  const setActiveSheet = useRoundStore(s => s.setActiveSheet);
  const addSheet       = useRoundStore(s => s.addSheet);

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
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn"
        style={styles.addBtn}
        onClick={() => addSheet({ title: 'Untitled', group: 'offcase' })}
        data-testid="add-sheet"
      >
        + Add sheet
      </button>
    </nav>
  );
}

// ─── Sheet row ────────────────────────────────────────────────────────────────

interface SheetRowProps {
  sheet: Sheet;
  dropCount: number;
  active: boolean;
  onSelect: () => void;
}

function SheetRow({ sheet, dropCount, active, onSelect }: SheetRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      data-testid={`sheet-${sheet.id}`}
      style={{
        ...styles.sheetRow,
        ...(active ? styles.sheetRowActive : null),
      }}
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
    border:         '1px solid transparent',
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

  addBtn: {
    margin: '8px',
    flex:   '0 0 auto',
  } as React.CSSProperties,
} as const;
