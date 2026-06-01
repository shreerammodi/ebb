/**
 * Tests for command handlers (TDD-first).
 *
 * Each test sets up a real round in useRoundStore, then calls executeCommand
 * and asserts the resulting store state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import { executeCommand } from './commands';

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: 'normal' as const,
  selection: null,
  keymapName: 'vim' as const,
  quickSwitcherOpen: false,
  settingsOpen: false,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

/** Sets up a policy round, one sheet, and returns useful ids. */
function setupRound() {
  const fmt = makeFormatByKey('policy');
  const store = useRoundStore.getState();
  store.createRound({ role: 'aff', format: fmt, meta: {} });
  const sheetId = useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
  return { fmt, sheetId, speeches: fmt.speeches };
}

describe('executeCommand — no-op safety', () => {
  beforeEach(resetStore);

  it('no-ops when round is null', () => {
    executeCommand('move.down');
    executeCommand('node.delete');
    executeCommand('arg.newRoot');
    expect(useRoundStore.getState().round).toBeNull();
  });

  it('no-ops navigation when selection is null', () => {
    setupRound();
    useRoundStore.getState().setSelection(null);
    executeCommand('move.down');
    expect(useRoundStore.getState().selection).toBeNull();
  });
});

describe('move.down / move.up', () => {
  beforeEach(resetStore);

  it('move.down moves selection to the node below in the column', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id; // 1NC
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    executeCommand('move.down');
    expect(useRoundStore.getState().selection?.nodeId).toBe(b);
  });

  it('move.up moves selection to the node above', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: b });

    executeCommand('move.up');
    expect(useRoundStore.getState().selection?.nodeId).toBe(a);
  });

  it('move.down no-ops at the bottom of the column', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });
    executeCommand('move.down');
    expect(useRoundStore.getState().selection?.nodeId).toBe(a);
  });
});

describe('move.left / move.right', () => {
  beforeEach(resetStore);

  it('move.left selects the parent', () => {
    const { sheetId, speeches } = setupRound();
    const parentSp = speeches[1].id;
    const childSp = speeches[2].id;
    const p = useRoundStore.getState().addNode({ sheetId, speechId: parentSp, parentId: null });
    const c = useRoundStore.getState().addNode({ sheetId, speechId: childSp, parentId: p });
    useRoundStore.getState().setSelection({ sheetId, speechId: childSp, nodeId: c });

    executeCommand('move.left');
    const sel = useRoundStore.getState().selection;
    expect(sel?.nodeId).toBe(p);
    expect(sel?.speechId).toBe(parentSp);
  });

  it('move.right selects the first child', () => {
    const { sheetId, speeches } = setupRound();
    const parentSp = speeches[1].id;
    const childSp = speeches[2].id;
    const p = useRoundStore.getState().addNode({ sheetId, speechId: parentSp, parentId: null });
    const c = useRoundStore.getState().addNode({ sheetId, speechId: childSp, parentId: p });
    useRoundStore.getState().setSelection({ sheetId, speechId: parentSp, nodeId: p });

    executeCommand('move.right');
    const sel = useRoundStore.getState().selection;
    expect(sel?.nodeId).toBe(c);
    expect(sel?.speechId).toBe(childSp);
  });

  it('move.left no-ops when selection.nodeId is empty', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[0].id;
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: '' });
    executeCommand('move.left');
    expect(useRoundStore.getState().selection?.nodeId).toBe('');
  });
});

describe('edit.enter / edit.exit', () => {
  beforeEach(resetStore);

  it('edit.enter on empty cell creates a root node and enters insert mode', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[0].id;
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: '' });

    executeCommand('edit.enter');
    const st = useRoundStore.getState();
    expect(st.mode).toBe('insert');
    expect(st.selection?.nodeId).not.toBe('');
    const created = st.round!.nodes.find(n => n.id === st.selection!.nodeId);
    expect(created?.parentId).toBeNull();
    expect(created?.speechId).toBe(sp);
  });

  it('edit.enter on an existing node just enters insert mode', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[0].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    executeCommand('edit.enter');
    const st = useRoundStore.getState();
    expect(st.mode).toBe('insert');
    expect(st.selection?.nodeId).toBe(a);
  });

  it('edit.exit returns to normal mode', () => {
    setupRound();
    useRoundStore.getState().setMode('insert');
    executeCommand('edit.exit');
    expect(useRoundStore.getState().mode).toBe('normal');
  });
});

describe('node.addAnswer', () => {
  beforeEach(resetStore);

  it('adds a sibling with the same parentId and selects it in insert mode', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    executeCommand('node.addAnswer');
    const st = useRoundStore.getState();
    expect(st.mode).toBe('insert');
    const newId = st.selection!.nodeId;
    expect(newId).not.toBe(a);
    const created = st.round!.nodes.find(n => n.id === newId);
    expect(created?.parentId).toBeNull();
    expect(created?.speechId).toBe(sp);
  });
});

describe('node.answerAcross', () => {
  beforeEach(resetStore);

  it('creates a child in the next opposing speech and selects it', () => {
    const { sheetId, speeches } = setupRound();
    const affSp = speeches[0].id; // 1AC aff
    const negSp = speeches[1].id; // 1NC neg
    const a = useRoundStore.getState().addNode({ sheetId, speechId: affSp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: affSp, nodeId: a });

    executeCommand('node.answerAcross');
    const st = useRoundStore.getState();
    expect(st.mode).toBe('insert');
    const newId = st.selection!.nodeId;
    const created = st.round!.nodes.find(n => n.id === newId);
    expect(created?.parentId).toBe(a);
    expect(created?.speechId).toBe(negSp);
    expect(st.selection?.speechId).toBe(negSp);
  });

  it('no-ops when there is no opposing speech', () => {
    const { sheetId, speeches } = setupRound();
    const last = speeches[speeches.length - 1].id; // 2AR aff, last
    const a = useRoundStore.getState().addNode({ sheetId, speechId: last, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: last, nodeId: a });
    const before = useRoundStore.getState().round!.nodes.length;

    executeCommand('node.answerAcross');
    expect(useRoundStore.getState().round!.nodes.length).toBe(before);
  });
});

describe('arg.newRoot', () => {
  beforeEach(resetStore);

  it('adds a root node in the current speech and selects it', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[2].id;
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: '' });

    executeCommand('arg.newRoot');
    const st = useRoundStore.getState();
    expect(st.mode).toBe('insert');
    const created = st.round!.nodes.find(n => n.id === st.selection!.nodeId);
    expect(created?.parentId).toBeNull();
    expect(created?.speechId).toBe(sp);
  });

  it('falls back to the first speech of the format when no selection', () => {
    const { sheetId, speeches } = setupRound();
    useRoundStore.getState().setActiveSheet(sheetId);
    useRoundStore.getState().setSelection(null);

    executeCommand('arg.newRoot');
    const st = useRoundStore.getState();
    const created = st.round!.nodes.find(n => n.id === st.selection!.nodeId);
    expect(created?.speechId).toBe(speeches[0].id);
  });
});

describe('node.delete', () => {
  beforeEach(resetStore);

  it('removes the selected node and clears selection', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    executeCommand('node.delete');
    const st = useRoundStore.getState();
    expect(st.round!.nodes.find(n => n.id === a)).toBeUndefined();
    expect(st.selection).toBeNull();
  });
});

describe('status toggles', () => {
  beforeEach(resetStore);

  it('status.toggleConceded toggles the conceded status', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    executeCommand('status.toggleConceded');
    expect(
      useRoundStore.getState().round!.nodes.find(n => n.id === a)?.statuses,
    ).toContain('conceded');

    executeCommand('status.toggleConceded');
    expect(
      useRoundStore.getState().round!.nodes.find(n => n.id === a)?.statuses,
    ).not.toContain('conceded');
  });

  it('status.toggleExtended toggles the extended status', () => {
    const { sheetId, speeches } = setupRound();
    const sp = speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    executeCommand('status.toggleExtended');
    expect(
      useRoundStore.getState().round!.nodes.find(n => n.id === a)?.statuses,
    ).toContain('extended');
  });
});

describe('sheet navigation', () => {
  beforeEach(resetStore);

  function threeSheets() {
    setupRound();
    const s = useRoundStore.getState();
    // setupRound already added one sheet ('DA'). Add two more.
    const s2 = s.addSheet({ title: 'CP', group: 'offcase' });
    const s3 = s.addSheet({ title: 'K', group: 'offcase' });
    const sheets = useRoundStore.getState().round!.sheets
      .slice()
      .sort((a, b) => a.order - b.order);
    return { sheets, s2, s3 };
  }

  it('sheet.next activates the next sheet by order (clamped)', () => {
    const { sheets } = threeSheets();
    useRoundStore.getState().setActiveSheet(sheets[0].id);
    executeCommand('sheet.next');
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[1].id);
    executeCommand('sheet.next');
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[2].id);
    executeCommand('sheet.next'); // clamp
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[2].id);
  });

  it('sheet.prev activates the previous sheet (clamped)', () => {
    const { sheets } = threeSheets();
    useRoundStore.getState().setActiveSheet(sheets[2].id);
    executeCommand('sheet.prev');
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[1].id);
    executeCommand('sheet.prev');
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[0].id);
    executeCommand('sheet.prev'); // clamp
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[0].id);
  });

  it('sheet.jump2 activates the 2nd sheet', () => {
    const { sheets } = threeSheets();
    executeCommand('sheet.jump2');
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[1].id);
  });

  it('sheet.jump9 no-ops when out of range', () => {
    const { sheets } = threeSheets();
    useRoundStore.getState().setActiveSheet(sheets[0].id);
    executeCommand('sheet.jump9');
    expect(useRoundStore.getState().activeSheetId).toBe(sheets[0].id);
  });

  it('sheet.new adds a sheet and activates it', () => {
    threeSheets();
    const before = useRoundStore.getState().round!.sheets.length;
    executeCommand('sheet.new');
    const st = useRoundStore.getState();
    expect(st.round!.sheets.length).toBe(before + 1);
    expect(st.activeSheetId).toBe(
      st.round!.sheets.find(s => s.title === 'Untitled')?.id,
    );
  });
});

describe('modal flags', () => {
  beforeEach(resetStore);

  it('sheet.quickSwitch opens the quick switcher', () => {
    setupRound();
    executeCommand('sheet.quickSwitch');
    expect(useRoundStore.getState().quickSwitcherOpen).toBe(true);
  });

  it('settings.open opens settings', () => {
    setupRound();
    executeCommand('settings.open');
    expect(useRoundStore.getState().settingsOpen).toBe(true);
  });
});

