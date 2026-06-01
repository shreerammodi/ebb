/**
 * Sidebar component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import Sidebar from './Sidebar';

function resetStore() {
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: 'normal',
    selection: null,
    quickSwitcherOpen: false,
    settingsOpen: false,
  });
}

/** Bootstraps a round with a Case sheet and one off-case sheet. */
function setupRound() {
  const store = useRoundStore.getState();
  store.createRound({
    role: 'aff',
    format: makeFormatByKey('policy'),
    meta: { opponent: 'Opp' },
  });
  const caseId = store.addSheet({ title: 'Case', group: 'case' });
  const daId = store.addSheet({ title: 'Disad', group: 'offcase' });
  return { caseId, daId };
}

describe('Sidebar', () => {
  beforeEach(() => {
    resetStore();
  });

  it('lists sheets grouped as Case / Off-case', () => {
    setupRound();
    render(<Sidebar />);

    // Group header (unique)
    expect(screen.getByText('Off-case')).toBeInTheDocument();
    // "Case" appears as both the group header and a sheet title.
    expect(screen.getAllByText('Case').length).toBe(2);

    // Off-case sheet title
    expect(screen.getByText('Disad')).toBeInTheDocument();
  });

  it('shows a drop badge when a sheet has drops', () => {
    const { caseId } = setupRound();
    const store = useRoundStore.getState();
    const round = store.round!;
    const speeches = round.format.speeches;
    const affSpeech = speeches.find(s => s.side === 'aff')!; // 1AC
    const negSpeech = speeches.find(s => s.side === 'neg')!; // 1NC

    // An aff argument that the neg never answers, plus a neg node so that the
    // opposing speech "happened" — this makes the aff node a drop.
    store.addNode({ sheetId: caseId, speechId: affSpeech.id, parentId: null, text: 'Contention 1' });
    store.addNode({ sheetId: caseId, speechId: negSpeech.id, parentId: null, text: 'Off-topic' });

    render(<Sidebar />);

    expect(screen.getByTestId(`drop-badge-${caseId}`)).toBeInTheDocument();
  });

  it('clicking a sheet calls setActiveSheet', async () => {
    const user = userEvent.setup();
    const { caseId, daId } = setupRound();

    render(<Sidebar />);

    await user.click(screen.getByTestId(`sheet-${daId}`));
    expect(useRoundStore.getState().activeSheetId).toBe(daId);

    await user.click(screen.getByTestId(`sheet-${caseId}`));
    expect(useRoundStore.getState().activeSheetId).toBe(caseId);
  });

  it('"+ Add sheet" button adds an off-case sheet', async () => {
    const user = userEvent.setup();
    setupRound();

    const before = useRoundStore.getState().round!.sheets.length;

    render(<Sidebar />);
    await user.click(screen.getByTestId('add-sheet'));

    const after = useRoundStore.getState().round!;
    expect(after.sheets).toHaveLength(before + 1);

    const newest = after.sheets[after.sheets.length - 1];
    expect(newest.title).toBe('Untitled');
    expect(newest.group).toBe('offcase');
  });
});
