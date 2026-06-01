'use client';

/**
 * RoundHeader — top header bar.
 *
 * Shows the round participants based on the user's role:
 *   - aff / neg: "Aff vs <opponent>"
 *   - judge:     "<affName> (Aff) vs <negName> (Neg)"
 *
 * Timers (Task 15) and export/import buttons (Task 18) come later.
 */

import { useRoundStore } from '@/lib/store/useRoundStore';

export default function RoundHeader() {
  const round = useRoundStore(s => s.round);

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

  return (
    <header style={styles.header} data-testid="round-header">
      <span style={styles.participants}>{participants}</span>
    </header>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  header: {
    display:       'flex',
    alignItems:    'center',
    height:        '48px',
    padding:       '0 16px',
    background:    'var(--panel)',
    borderBottom:  '1px solid var(--line)',
    flex:          '0 0 auto',
  } as React.CSSProperties,

  participants: {
    fontSize:   '14px',
    fontWeight: 600,
    color:      'var(--ink)',
  } as React.CSSProperties,
} as const;
