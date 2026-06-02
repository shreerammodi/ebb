/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('updates store round and resets activeSheetId/selection/mode when a valid file is imported', async () => {
    const { readRoundFile } = await import('@/lib/persistence/io');

    // Set up an initial round
    setupRound('aff', { opponent: 'Smith/Jones' });
    // Simulate stale selection state
    useRoundStore.setState({ activeSheetId: 'stale-sheet', selection: { sheetId: 'stale-sheet', speechId: 's1', nodeId: 'n1' }, mode: 'insert' });

    // Build a different round to return from the mock
    useRoundStore.getState().createRound({
      role: 'neg',
      format: makeFormatByKey('policy'),
      meta: { affName: 'Alpha', negName: 'Beta' },
    });
    const importedRound = useRoundStore.getState().round!;

    // Reset store back to original so we can observe the change
    setupRound('aff', { opponent: 'Smith/Jones' });
    useRoundStore.setState({ activeSheetId: 'stale-sheet', selection: { sheetId: 'stale-sheet', speechId: 's1', nodeId: 'n1' }, mode: 'insert' });

    vi.mocked(readRoundFile).mockResolvedValueOnce(importedRound);

    render(<RoundHeader />);

    const fileInput = screen.getByTestId('import-file-input');
    const fakeFile = new File(['{}'], 'round.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      const state = useRoundStore.getState();
      expect(state.round).toBe(importedRound);
      expect(state.activeSheetId).toBeNull();
      expect(state.selection).toBeNull();
      expect(state.mode).toBe('normal');
    });
  });
});
