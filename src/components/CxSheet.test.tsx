import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import CxSheet from './CxSheet';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';

describe('CxSheet', () => {
  beforeEach(() => {
    useRoundStore.getState().createRound({ role: 'aff', format: makeFormatByKey('policy'), meta: {} });
  });
  it('renders the four CX period columns', () => {
    render(<CxSheet />);
    ['1AC CX', '1NC CX', '2AC CX', '2NC CX'].forEach(h => expect(screen.getByText(h)).toBeTruthy());
  });
  it('adds a row when the add button is clicked', async () => {
    render(<CxSheet />);
    await userEvent.click(screen.getByTestId('cx-add-1AC'));
    expect(useRoundStore.getState().round!.cx['1AC'].length).toBe(1);
  });
});
