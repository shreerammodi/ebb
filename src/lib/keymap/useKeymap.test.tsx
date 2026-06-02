import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import { useKeymap } from './useKeymap';

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: 'normal' as const,
  selection: null,
  keymapName: 'vim' as const,
  quickSwitcherOpen: false,
  settingsOpen: false,
  keymapOverrides: {} as Record<string, string>,
  renamingSheetId: null,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

function Harness() {
  useKeymap();
  return <div data-testid="harness" />;
}

function dispatchKey(key: string, init: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

describe('useKeymap', () => {
  beforeEach(resetStore);

  it('moves selection to the node below on "j" (vim normal)', () => {
    const fmt = makeFormatByKey('policy');
    const store = useRoundStore.getState();
    store.createRound({ role: 'aff', format: fmt, meta: {} });
    const sheetId = useRoundStore.getState().addSheet({ title: 'DA', group: 'neg' });
    const sp = fmt.speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    render(<Harness />);
    dispatchKey('j');

    expect(useRoundStore.getState().selection?.nodeId).toBe(b);
  });

  it('cleans up its listener on unmount', () => {
    const fmt = makeFormatByKey('policy');
    const store = useRoundStore.getState();
    store.createRound({ role: 'aff', format: fmt, meta: {} });
    const sheetId = useRoundStore.getState().addSheet({ title: 'DA', group: 'neg' });
    const sp = fmt.speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    const { unmount } = render(<Harness />);
    unmount();
    dispatchKey('j');

    // Selection unchanged because the listener was removed.
    expect(useRoundStore.getState().selection?.nodeId).toBe(a);
  });
});
