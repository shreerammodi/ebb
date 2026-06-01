/**
 * RoundSetup component tests.
 *
 * Uses the real Zustand store — no mocking needed.
 * Resets store state before each test so tests are isolated.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRoundStore } from '@/lib/store/useRoundStore';
import RoundSetup from './RoundSetup';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: 'normal',
    selection: null,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RoundSetup', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders role choices (Aff, Neg, Judge) and format choices (Policy, LD)', () => {
    render(<RoundSetup />);

    // Role buttons
    expect(screen.getByTestId('role-aff')).toBeInTheDocument();
    expect(screen.getByTestId('role-neg')).toBeInTheDocument();
    expect(screen.getByTestId('role-judge')).toBeInTheDocument();

    expect(screen.getByText('Aff')).toBeInTheDocument();
    expect(screen.getByText('Neg')).toBeInTheDocument();
    expect(screen.getByText('Judge')).toBeInTheDocument();

    // Format buttons
    expect(screen.getByTestId('format-policy')).toBeInTheDocument();
    expect(screen.getByTestId('format-ld')).toBeInTheDocument();

    expect(screen.getByText('Policy')).toBeInTheDocument();
    // LD label contains an em-dash
    expect(screen.getByText(/Lincoln/)).toBeInTheDocument();
  });

  it('shows two team-name fields (affName + negName) when Judge is selected', async () => {
    const user = userEvent.setup();
    render(<RoundSetup />);

    // Default role is Aff, so opponent field should be visible
    expect(screen.getByTestId('field-opponent')).toBeInTheDocument();

    // Click Judge
    await user.click(screen.getByTestId('role-judge'));

    // Opponent field should be gone
    expect(screen.queryByTestId('field-opponent')).not.toBeInTheDocument();

    // Both team name fields should appear
    expect(screen.getByTestId('field-affName')).toBeInTheDocument();
    expect(screen.getByTestId('field-negName')).toBeInTheDocument();

    // Judge name field should also be hidden when role is judge
    expect(screen.queryByTestId('field-judge')).not.toBeInTheDocument();
  });

  it('shows one opponent field when Aff or Neg is selected', async () => {
    const user = userEvent.setup();
    render(<RoundSetup />);

    // Default is Aff — opponent field visible
    expect(screen.getByTestId('field-opponent')).toBeInTheDocument();
    expect(screen.queryByTestId('field-affName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-negName')).not.toBeInTheDocument();

    // Switch to Neg — opponent field still visible, team fields absent
    await user.click(screen.getByTestId('role-neg'));
    expect(screen.getByTestId('field-opponent')).toBeInTheDocument();
    expect(screen.queryByTestId('field-affName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-negName')).not.toBeInTheDocument();

    // Judge name field should be shown for non-judge roles
    expect(screen.getByTestId('field-judge')).toBeInTheDocument();
  });

  it('calls createRound with correct payload and addSheet for the Case sheet on submit', async () => {
    const user = userEvent.setup();
    render(<RoundSetup />);

    // Select Neg role
    await user.click(screen.getByTestId('role-neg'));

    // Select LD format
    await user.click(screen.getByTestId('format-ld'));

    // Fill in opponent
    await user.type(screen.getByTestId('field-opponent'), 'Smith/Jones');

    // Submit
    await user.click(screen.getByTestId('submit'));

    // Inspect store state
    const state = useRoundStore.getState();

    expect(state.round).not.toBeNull();
    expect(state.round!.role).toBe('neg');
    expect(state.round!.format.name).toBe('Lincoln–Douglas');
    expect(state.round!.meta.opponent).toBe('Smith/Jones');

    // Case sheet should have been created and set as active
    expect(state.round!.sheets).toHaveLength(1);
    expect(state.round!.sheets[0].title).toBe('Case');
    expect(state.round!.sheets[0].group).toBe('case');
    expect(state.activeSheetId).toBe(state.round!.sheets[0].id);
  });

  it('calls createRound with affName/negName when Judge role submits', async () => {
    const user = userEvent.setup();
    render(<RoundSetup />);

    // Select Judge role
    await user.click(screen.getByTestId('role-judge'));

    // Fill team names
    await user.type(screen.getByTestId('field-affName'), 'Team Alpha');
    await user.type(screen.getByTestId('field-negName'), 'Team Beta');

    // Submit
    await user.click(screen.getByTestId('submit'));

    const state = useRoundStore.getState();

    expect(state.round).not.toBeNull();
    expect(state.round!.role).toBe('judge');
    expect(state.round!.meta.affName).toBe('Team Alpha');
    expect(state.round!.meta.negName).toBe('Team Beta');
    // opponent should not be set
    expect(state.round!.meta.opponent).toBeUndefined();

    // Case sheet created
    expect(state.round!.sheets).toHaveLength(1);
    expect(state.activeSheetId).toBe(state.round!.sheets[0].id);
  });
});
