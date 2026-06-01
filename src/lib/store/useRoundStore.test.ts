/**
 * Tests for useRoundStore — written first (TDD).
 *
 * Uses useRoundStore.getState() / setState() / subscribe() which zustand
 * exposes as static methods on the hook.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRoundStore } from './useRoundStore';
import {
  selectSheetNodes,
  selectDrops,
  selectSheetDropCount,
  selectSheetsByGroup,
} from './useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import type { Round } from '@/lib/model/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: 'normal' as const,
  selection: null,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

// ─── createRound ─────────────────────────────────────────────────────────────

describe('createRound', () => {
  beforeEach(resetStore);

  it('sets a non-null round with the provided role and format', () => {
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'judge', format: fmt, meta: {} });
    const { round } = useRoundStore.getState();
    expect(round).not.toBeNull();
    expect(round!.role).toBe('judge');
    expect(round!.format).toEqual(fmt);
  });

  it('generates a round id with round_ prefix', () => {
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    const { round } = useRoundStore.getState();
    expect(round!.id).toMatch(/^round_/);
  });

  it('initializes with empty sheets and nodes', () => {
    const fmt = makeFormatByKey('ld');
    useRoundStore.getState().createRound({ role: 'neg', format: fmt, meta: {} });
    const { round } = useRoundStore.getState();
    expect(round!.sheets).toEqual([]);
    expect(round!.nodes).toEqual([]);
  });

  it('initializes timers from format prepSeconds', () => {
    const fmt = makeFormatByKey('policy'); // prepSeconds: { aff: 480, neg: 480 }
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    const { round } = useRoundStore.getState();
    expect(round!.timers).toEqual({
      activeSpeechId: null,
      speechRemaining: null,
      running: false,
      prepRemaining: { aff: 480, neg: 480 },
      prepRunning: null,
    });
  });

  it('stores the optional topic', () => {
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {}, topic: 'Resolved: X' });
    const { round } = useRoundStore.getState();
    expect(round!.topic).toBe('Resolved: X');
  });

  it('stores the provided meta', () => {
    const fmt = makeFormatByKey('ld');
    const meta = { tournament: 'Nationals', judge: 'Alice' };
    useRoundStore.getState().createRound({ role: 'neg', format: fmt, meta });
    const { round } = useRoundStore.getState();
    expect(round!.meta).toEqual(meta);
  });

  it('sets createdAt and updatedAt to approximately now', () => {
    const before = Date.now();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    const after = Date.now();
    const { round } = useRoundStore.getState();
    expect(round!.createdAt).toBeGreaterThanOrEqual(before);
    expect(round!.createdAt).toBeLessThanOrEqual(after);
    expect(round!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(round!.updatedAt).toBeLessThanOrEqual(after);
  });

  it('resets activeSheetId, mode, selection to defaults', () => {
    // Pre-pollute state
    useRoundStore.setState({ activeSheetId: 'old', mode: 'insert', selection: { sheetId: 'x', speechId: 'y', nodeId: 'z' } });

    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    const state = useRoundStore.getState();
    expect(state.activeSheetId).toBeNull();
    expect(state.mode).toBe('normal');
    expect(state.selection).toBeNull();
  });
});

// ─── addSheet ────────────────────────────────────────────────────────────────

describe('addSheet', () => {
  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
  });

  it('returns a sheet id with sheet_ prefix', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    expect(id).toMatch(/^sheet_/);
  });

  it('appends a sheet to round.sheets', () => {
    useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    expect(useRoundStore.getState().round!.sheets).toHaveLength(1);
  });

  it('sets activeSheetId to the first added sheet', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    expect(useRoundStore.getState().activeSheetId).toBe(id);
  });

  it('does not change activeSheetId when a second sheet is added', () => {
    const first = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    expect(useRoundStore.getState().activeSheetId).toBe(first);
  });

  it('assigns incrementing order values', () => {
    useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    const sheets = useRoundStore.getState().round!.sheets;
    expect(sheets[0].order).toBe(0);
    expect(sheets[1].order).toBe(1);
  });

  it('updates round.updatedAt', () => {
    vi.useFakeTimers();
    const before = useRoundStore.getState().round!.updatedAt;
    vi.advanceTimersByTime(1);
    useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThan(before);
    vi.useRealTimers();
  });

  it('throws when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().addSheet({ title: 'x', group: 'case' })).toThrow('No active round');
  });
});

// ─── renameSheet / removeSheet / reorderSheet ─────────────────────────────────

describe('renameSheet', () => {
  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
  });

  it('renames a sheet', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().renameSheet(id, 'Updated Case');
    const sheet = useRoundStore.getState().round!.sheets.find(s => s.id === id);
    expect(sheet!.title).toBe('Updated Case');
  });

  it('updates updatedAt on rename', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const before = useRoundStore.getState().round!.updatedAt;
    useRoundStore.getState().renameSheet(id, 'New');
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().renameSheet('x', 'y')).not.toThrow();
  });
});

describe('removeSheet', () => {
  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
  });

  it('removes the sheet from round.sheets', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().removeSheet(id);
    expect(useRoundStore.getState().round!.sheets).toHaveLength(0);
  });

  it('also removes nodes belonging to that sheet', () => {
    const sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const fmt = useRoundStore.getState().round!.format;
    const speechId = fmt.speeches[0].id;
    useRoundStore.getState().addNode({ sheetId, speechId, parentId: null, text: 'arg' });
    expect(useRoundStore.getState().round!.nodes).toHaveLength(1);
    useRoundStore.getState().removeSheet(sheetId);
    expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
  });

  it('sets activeSheetId to null when active sheet is removed and no other sheets', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().removeSheet(id);
    expect(useRoundStore.getState().activeSheetId).toBeNull();
  });

  it('sets activeSheetId to another sheet when active is removed', () => {
    const first = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const second = useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    useRoundStore.getState().removeSheet(first);
    expect(useRoundStore.getState().activeSheetId).toBe(second);
  });

  it('does not change activeSheetId when a non-active sheet is removed', () => {
    const first = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const second = useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    useRoundStore.getState().removeSheet(second);
    expect(useRoundStore.getState().activeSheetId).toBe(first);
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().removeSheet('x')).not.toThrow();
  });

  it('clears selection when the selected sheet is removed', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const fmt = useRoundStore.getState().round!.format;
    const speechId = fmt.speeches[0].id;
    useRoundStore.getState().setSelection({ sheetId: id, speechId, nodeId: 'n1' });
    useRoundStore.getState().removeSheet(id);
    expect(useRoundStore.getState().selection).toBeNull();
  });

  it('keeps selection when a different sheet is removed', () => {
    const first = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const second = useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    const fmt = useRoundStore.getState().round!.format;
    const speechId = fmt.speeches[0].id;
    useRoundStore.getState().setSelection({ sheetId: first, speechId, nodeId: 'n1' });
    useRoundStore.getState().removeSheet(second);
    expect(useRoundStore.getState().selection?.sheetId).toBe(first);
  });
});

describe('reorderSheet', () => {
  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
  });

  it('updates the order of a sheet', () => {
    const id = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().reorderSheet(id, 5);
    const sheet = useRoundStore.getState().round!.sheets.find(s => s.id === id);
    expect(sheet!.order).toBe(5);
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().reorderSheet('x', 1)).not.toThrow();
  });
});

// ─── setActiveSheet ───────────────────────────────────────────────────────────

describe('setActiveSheet', () => {
  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
  });

  it('sets the active sheet', () => {
    useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    const second = useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    useRoundStore.getState().setActiveSheet(second);
    expect(useRoundStore.getState().activeSheetId).toBe(second);
  });
});

// ─── addNode ──────────────────────────────────────────────────────────────────

describe('addNode', () => {
  let sheetId: string;
  let speechId: string;

  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    speechId = useRoundStore.getState().round!.format.speeches[0].id;
  });

  it('returns a node id with node_ prefix', () => {
    const id = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
    expect(id).toMatch(/^node_/);
  });

  it('adds the node to round.nodes', () => {
    useRoundStore.getState().addNode({ sheetId, speechId, parentId: null, text: 'T' });
    expect(useRoundStore.getState().round!.nodes).toHaveLength(1);
    expect(useRoundStore.getState().round!.nodes[0].text).toBe('T');
  });

  it('bumps updatedAt after adding a node', () => {
    vi.useFakeTimers();
    const before = useRoundStore.getState().round!.updatedAt;
    vi.advanceTimersByTime(1);
    useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThan(before);
    vi.useRealTimers();
  });

  it('throws when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().addNode({ sheetId, speechId, parentId: null })).toThrow('No active round');
  });
});

// ─── updateNodeText ───────────────────────────────────────────────────────────

describe('updateNodeText', () => {
  let sheetId: string;
  let speechId: string;
  let nodeId: string;

  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    speechId = useRoundStore.getState().round!.format.speeches[0].id;
    nodeId = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null, text: 'original' });
  });

  it('updates the text of the given node', () => {
    useRoundStore.getState().updateNodeText(nodeId, 'updated');
    const node = useRoundStore.getState().round!.nodes.find(n => n.id === nodeId);
    expect(node!.text).toBe('updated');
  });

  it('bumps updatedAt', () => {
    const before = useRoundStore.getState().round!.updatedAt;
    useRoundStore.getState().updateNodeText(nodeId, 'new');
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().updateNodeText(nodeId, 'x')).not.toThrow();
  });
});

// ─── toggleNodeStatus ─────────────────────────────────────────────────────────

describe('toggleNodeStatus', () => {
  let sheetId: string;
  let speechId: string;
  let nodeId: string;

  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    speechId = useRoundStore.getState().round!.format.speeches[0].id;
    nodeId = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
  });

  it('adds a status when toggled on', () => {
    useRoundStore.getState().toggleNodeStatus(nodeId, 'conceded');
    const node = useRoundStore.getState().round!.nodes.find(n => n.id === nodeId);
    expect(node!.statuses).toContain('conceded');
  });

  it('removes a status when toggled off', () => {
    useRoundStore.getState().toggleNodeStatus(nodeId, 'conceded');
    useRoundStore.getState().toggleNodeStatus(nodeId, 'conceded');
    const node = useRoundStore.getState().round!.nodes.find(n => n.id === nodeId);
    expect(node!.statuses).not.toContain('conceded');
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().toggleNodeStatus(nodeId, 'extended')).not.toThrow();
  });
});

// ─── setNodeParent ────────────────────────────────────────────────────────────

describe('setNodeParent', () => {
  let sheetId: string;
  let speechId: string;
  let nodeA: string;
  let nodeB: string;

  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    speechId = useRoundStore.getState().round!.format.speeches[0].id;
    nodeA = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
    nodeB = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
  });

  it('sets nodeB parent to nodeA', () => {
    useRoundStore.getState().setNodeParent(nodeB, nodeA);
    const node = useRoundStore.getState().round!.nodes.find(n => n.id === nodeB);
    expect(node!.parentId).toBe(nodeA);
  });

  it('bumps updatedAt', () => {
    const before = useRoundStore.getState().round!.updatedAt;
    useRoundStore.getState().setNodeParent(nodeB, nodeA);
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().setNodeParent(nodeB, nodeA)).not.toThrow();
  });
});

// ─── removeNode ───────────────────────────────────────────────────────────────

describe('removeNode', () => {
  let sheetId: string;
  let speechId: string;
  let nodeId: string;

  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    speechId = useRoundStore.getState().round!.format.speeches[0].id;
    nodeId = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
  });

  it('removes the node from round.nodes', () => {
    useRoundStore.getState().removeNode(nodeId);
    expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
  });

  it('bumps updatedAt', () => {
    vi.useFakeTimers();
    const before = useRoundStore.getState().round!.updatedAt;
    vi.advanceTimersByTime(1);
    useRoundStore.getState().removeNode(nodeId);
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThan(before);
    vi.useRealTimers();
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().removeNode(nodeId)).not.toThrow();
  });

  it('re-parents children to grandparent when parent is removed', () => {
    const parent = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
    const child = useRoundStore.getState().addNode({ sheetId, speechId, parentId: parent });
    useRoundStore.getState().removeNode(parent);
    const nodes = useRoundStore.getState().round!.nodes;
    // parent is gone
    expect(nodes.find(n => n.id === parent)).toBeUndefined();
    // child survives and its parentId is now the grandparent (null)
    const childNode = nodes.find(n => n.id === child);
    expect(childNode).toBeDefined();
    expect(childNode!.parentId).toBeNull();
  });

  it('clears selection when the selected node is removed', () => {
    useRoundStore.getState().setSelection({ sheetId, speechId, nodeId });
    expect(useRoundStore.getState().selection?.nodeId).toBe(nodeId);
    useRoundStore.getState().removeNode(nodeId);
    expect(useRoundStore.getState().selection).toBeNull();
  });

  it('keeps selection when a different node is removed', () => {
    const other = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId, nodeId });
    useRoundStore.getState().removeNode(other);
    expect(useRoundStore.getState().selection?.nodeId).toBe(nodeId);
  });
});

// ─── moveNode ─────────────────────────────────────────────────────────────────

describe('moveNode', () => {
  let sheetId: string;
  let speechId: string;
  let nodeId: string;

  beforeEach(() => {
    resetStore();
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    speechId = useRoundStore.getState().round!.format.speeches[0].id;
    nodeId = useRoundStore.getState().addNode({ sheetId, speechId, parentId: null });
  });

  it('updates the node order', () => {
    useRoundStore.getState().moveNode(nodeId, 7);
    const node = useRoundStore.getState().round!.nodes.find(n => n.id === nodeId);
    expect(node!.order).toBe(7);
  });

  it('bumps updatedAt', () => {
    const before = useRoundStore.getState().round!.updatedAt;
    useRoundStore.getState().moveNode(nodeId, 7);
    expect(useRoundStore.getState().round!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('is no-op when round is null', () => {
    useRoundStore.setState(BLANK_STATE);
    expect(() => useRoundStore.getState().moveNode(nodeId, 2)).not.toThrow();
  });
});

// ─── setMode / setSelection ───────────────────────────────────────────────────

describe('setMode', () => {
  beforeEach(resetStore);

  it('sets mode to insert', () => {
    useRoundStore.getState().setMode('insert');
    expect(useRoundStore.getState().mode).toBe('insert');
  });

  it('sets mode back to normal', () => {
    useRoundStore.getState().setMode('insert');
    useRoundStore.getState().setMode('normal');
    expect(useRoundStore.getState().mode).toBe('normal');
  });
});

describe('setSelection', () => {
  beforeEach(resetStore);

  it('sets selection', () => {
    const sel = { sheetId: 'a', speechId: 'b', nodeId: 'c' };
    useRoundStore.getState().setSelection(sel);
    expect(useRoundStore.getState().selection).toEqual(sel);
  });

  it('clears selection with null', () => {
    useRoundStore.getState().setSelection({ sheetId: 'a', speechId: 'b', nodeId: 'c' });
    useRoundStore.getState().setSelection(null);
    expect(useRoundStore.getState().selection).toBeNull();
  });
});

// ─── Pure selectors ───────────────────────────────────────────────────────────

describe('selectSheetNodes', () => {
  it('returns empty array for null round', () => {
    expect(selectSheetNodes(null, 'x')).toEqual([]);
  });

  it('returns only nodes on the given sheet', () => {
    const fmt = makeFormatByKey('policy');
    useRoundStore.setState(BLANK_STATE);
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    const sheetA = useRoundStore.getState().addSheet({ title: 'A', group: 'case' });
    const sheetB = useRoundStore.getState().addSheet({ title: 'B', group: 'offcase' });
    const speechId = fmt.speeches[0].id;
    useRoundStore.getState().addNode({ sheetId: sheetA, speechId, parentId: null, text: 'on A' });
    useRoundStore.getState().addNode({ sheetId: sheetB, speechId, parentId: null, text: 'on B' });

    const round = useRoundStore.getState().round;
    const nodesA = selectSheetNodes(round, sheetA);
    expect(nodesA).toHaveLength(1);
    expect(nodesA[0].text).toBe('on A');
  });
});

describe('selectDrops and selectSheetDropCount', () => {
  it('returns empty arrays for null round', () => {
    expect(selectDrops(null, 'x')).toEqual([]);
    expect(selectSheetDropCount(null, 'x')).toBe(0);
  });

  it('detects drops on a sheet with policy format', () => {
    useRoundStore.setState(BLANK_STATE);
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'judge', format: fmt, meta: {} });
    const sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });

    // speeches: 1AC(aff), 1NC(neg), 2AC(aff) ...
    const [s1AC, s1NC, s2AC] = fmt.speeches.map(s => s.id);

    // Add a node in 1AC
    const n1 = useRoundStore.getState().addNode({ sheetId, speechId: s1AC, parentId: null, text: 'arg' });
    // Add a node in 1NC (so neg "happened") but NOT answering n1
    useRoundStore.getState().addNode({ sheetId, speechId: s1NC, parentId: null, text: 'unrelated' });
    // Also add a node in 2AC so aff happened
    useRoundStore.getState().addNode({ sheetId, speechId: s2AC, parentId: null, text: 'aff' });

    const round = useRoundStore.getState().round;
    const drops = selectDrops(round, sheetId);
    // n1 in 1AC (aff) should be dropped because 1NC happened but didn't answer it
    expect(drops).toContain(n1);
    expect(selectSheetDropCount(round, sheetId)).toBeGreaterThan(0);
  });
});

describe('selectSheetsByGroup', () => {
  it('returns empty array for null round', () => {
    expect(selectSheetsByGroup(null, 'case')).toEqual([]);
  });

  it('returns only sheets matching the group, sorted by order', () => {
    useRoundStore.setState(BLANK_STATE);
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'aff', format: fmt, meta: {} });
    useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });
    useRoundStore.getState().addSheet({ title: 'DA', group: 'offcase' });
    useRoundStore.getState().addSheet({ title: 'K', group: 'offcase' });

    const round = useRoundStore.getState().round;
    const offcase = selectSheetsByGroup(round, 'offcase');
    expect(offcase).toHaveLength(2);
    expect(offcase.every(s => s.group === 'offcase')).toBe(true);
    expect(offcase[0].order).toBeLessThanOrEqual(offcase[1].order);
  });
});
