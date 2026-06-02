/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import type { Role, RoundMeta } from '@/lib/model/types';
import RoundHeader from './RoundHeader';

// Mock io functions used by the header
vi.mock('@/lib/persistence/io', () => ({
  downloadRoundFile: vi.fn(),
  readRoundFile: vi.fn(),
}));

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

  it('renders Export, Import, and Print buttons', () => {
    setupRound('aff', { opponent: 'Smith/Jones' });
    render(<RoundHeader />);
    expect(screen.getByTestId('export-btn')).toBeInTheDocument();
    expect(screen.getByTestId('import-btn')).toBeInTheDocument();
    expect(screen.getByTestId('print-btn')).toBeInTheDocument();
  });

  it('calls window.print when Print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    setupRound('aff', { opponent: 'Smith/Jones' });
    render(<RoundHeader />);
    fireEvent.click(screen.getByTestId('print-btn'));
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });

  it('calls downloadRoundFile when Export button is clicked', async () => {
    const { downloadRoundFile } = await import('@/lib/persistence/io');
    setupRound('aff', { opponent: 'Smith/Jones' });
    render(<RoundHeader />);
    fireEvent.click(screen.getByTestId('export-btn'));
    expect(downloadRoundFile).toHaveBeenCalled();
  });
});
