'use client';

/**
 * PrintView — renders all sheets as static read-only grids for printing.
 *
 * Iterates over sheets (sorted by order) and renders each with its title
 * and a FlowGrid. Wraps everything in a print-appropriate container.
 * This component is shown in the DOM alongside the normal workspace so that
 * window.print() captures it; the workspace hides via .no-print, and this
 * shows via .print-only.
 */

import { useRoundStore } from '@/lib/store/useRoundStore';
import FlowGrid from './FlowGrid';

export default function PrintView() {
  const round = useRoundStore(s => s.round);

  if (!round) return null;

  const sheets = round.sheets.slice().sort((a, b) => a.order - b.order);

  return (
    <div className="print-only" data-testid="print-view" style={styles.container}>
      {sheets.map(sheet => (
        <div key={sheet.id} style={styles.sheet}>
          <h2 style={styles.sheetTitle} data-testid={`print-sheet-title-${sheet.id}`}>
            {sheet.title}
          </h2>
          <FlowGrid sheetId={sheet.id} />
        </div>
      ))}
    </div>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  container: {
    padding:    '16px',
    background: 'white',
    color:      'black',
  } as React.CSSProperties,

  sheet: {
    marginBottom:  '32px',
    pageBreakAfter: 'auto',
  } as React.CSSProperties,

  sheetTitle: {
    fontSize:     '16px',
    fontWeight:   700,
    marginBottom: '8px',
    marginTop:    0,
    color:        'black',
  } as React.CSSProperties,
} as const;
