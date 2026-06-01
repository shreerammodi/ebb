/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import type { Role, RoundMeta } from '@/lib/model/types';
import RoundHeader from './RoundHeader';

function setupRound(role: Role, meta: RoundMeta) {
  useRoundStore.getState().createRound({
    role,
    format: makeFormatByKey('policy'),
    meta,
  });
}

describe('RoundHeader', () => {
  beforeEach(() => {
    useRoundStore.setState({
      round: null,
      activeSheetId: null,
      mode: 'normal',
      selection: null,
      quickSwitcherOpen: false,
      settingsOpen: false,
    });
  });

  it('renders "Aff vs <opponent>" for role=aff', () => {
    setupRound('aff', { opponent: 'Smith/Jones' });
    render(<RoundHeader />);
    expect(screen.getByText('Aff vs Smith/Jones')).toBeInTheDocument();
  });

  it('renders "<affName> (Aff) vs <negName> (Neg)" for role=judge', () => {
    setupRound('judge', { affName: 'Team Alpha', negName: 'Team Beta' });
    render(<RoundHeader />);
    expect(
      screen.getByText('Team Alpha (Aff) vs Team Beta (Neg)'),
    ).toBeInTheDocument();
  });
});
