/**
 * FlowGrid + GridCell render tests (TDD-first).
 *
 * Setup:
 *   - Policy format (1AC, 1NC, 2AC, 2NC/1NR[Neg block], 1AR, 2NR, 2AR)
 *   - One sheet
 *   - 1NC root arg  →  three 2AC children (#1, #2, #3)
 *   - 2NC answers #1 and #2 but NOT #3  (so #3 is dropped)
 *   - Selection set to the #2 cell
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';
import FlowGrid from './FlowGrid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: 'normal' as const,
  selection: null,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

// ─── Setup shared state ───────────────────────────────────────────────────────

interface TestContext {
  sheetId: string;
  ncId: string;   // 1NC node (root)
  ac1Id: string;  // 2AC child #1
  ac2Id: string;  // 2AC child #2
  ac3Id: string;  // 2AC child #3 (dropped)
  nc2Id: string;  // 2NC answer to ac1
  nc3Id: string;  // 2NC answer to ac2
}

function setupScenario(): TestContext {
  const fmt = makeFormatByKey('policy');
  useRoundStore.getState().createRound({ role: 'neg', format: fmt, meta: {} });
  const sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'case' });

  const speeches = fmt.speeches;
  // Policy order: 1AC[0], 1NC[1], 2AC[2], 2NC[3], 1NR[4], 1AR[5], 2NR[6], 2AR[7]
  const s1NC = speeches[1].id;
  const s2AC = speeches[2].id;
  const s2NC = speeches[3].id;

  // 1NC root argument
  const ncId = useRoundStore.getState().addNode({
    sheetId,
    speechId: s1NC,
    parentId: null,
    text: 'Topicality',
  });

  // Three 2AC responses to 1NC
  const ac1Id = useRoundStore.getState().addNode({
    sheetId,
    speechId: s2AC,
    parentId: ncId,
    text: 'We meet',
  });
  const ac2Id = useRoundStore.getState().addNode({
    sheetId,
    speechId: s2AC,
    parentId: ncId,
    text: 'Counter-interp',
  });
  const ac3Id = useRoundStore.getState().addNode({
    sheetId,
    speechId: s2AC,
    parentId: ncId,
    text: 'Standards',
  });

  // 2NC answers ac1 and ac2 but NOT ac3 → ac3 is dropped
  const nc2Id = useRoundStore.getState().addNode({
    sheetId,
    speechId: s2NC,
    parentId: ac1Id,
    text: '2NC answer to we meet',
  });
  const nc3Id = useRoundStore.getState().addNode({
    sheetId,
    speechId: s2NC,
    parentId: ac2Id,
    text: '2NC answer to counter-interp',
  });

  return { sheetId, ncId, ac1Id, ac2Id, ac3Id, nc2Id, nc3Id };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowGrid', () => {
  beforeEach(resetStore);

  // ── Column headers ─────────────────────────────────────────────────────────

  it('renders column headers with speech names', () => {
    const { sheetId } = setupScenario();
    render(<FlowGrid sheetId={sheetId} />);

    // All 8 policy speeches should appear as headers (in the bottom header row)
    expect(screen.getAllByRole('columnheader').some(h => h.textContent?.includes('1NC'))).toBe(true);
    expect(screen.getAllByRole('columnheader').some(h => h.textContent?.includes('2AC'))).toBe(true);
  });

  it('applies side-neg to 1NC header and side-aff to 2AC header', () => {
    const { sheetId } = setupScenario();
    render(<FlowGrid sheetId={sheetId} />);

    const headers = screen.getAllByRole('columnheader');
    const ncHeader = headers.find(h => h.textContent === '1NC');
    const acHeader = headers.find(h => h.textContent === '2AC');

    expect(ncHeader).toBeDefined();
    expect(acHeader).toBeDefined();
    expect(ncHeader!.classList.contains('side-neg')).toBe(true);
    expect(acHeader!.classList.contains('side-aff')).toBe(true);
  });

  // ── Group header row ───────────────────────────────────────────────────────

  it('renders a group header row labelling "Neg block" over the 2NC/1NR columns', () => {
    const { sheetId } = setupScenario();
    render(<FlowGrid sheetId={sheetId} />);

    // "Neg block" should appear as a colSpan header
    const headers = screen.getAllByRole('columnheader');
    const negBlockHeader = headers.find(h => h.textContent === 'Neg block');
    expect(negBlockHeader).toBeDefined();
    expect(negBlockHeader!.getAttribute('colspan') ?? negBlockHeader!.getAttribute('colSpan')).toBe('2');
  });

  // ── rowSpan for parent node ────────────────────────────────────────────────

  it('renders the 1NC parent cell with rowSpan 3 (spanning its three 2AC answers)', () => {
    const { sheetId } = setupScenario();
    render(<FlowGrid sheetId={sheetId} />);

    // Find the cell containing "Topicality" (the 1NC root node)
    const cell = screen.getByText('Topicality').closest('td');
    expect(cell).toBeDefined();
    // rowSpan should be 3 because it has 3 children
    expect(cell!.getAttribute('rowspan') ?? cell!.getAttribute('rowSpan')).toBe('3');
  });

  // ── Response numbering ─────────────────────────────────────────────────────

  it('shows numbered prefixes "1." "2." "3." on the three 2AC children', () => {
    const { sheetId } = setupScenario();
    render(<FlowGrid sheetId={sheetId} />);

    const numSpans = document.querySelectorAll('.arg-num');
    const numTexts = Array.from(numSpans).map(s => s.textContent);
    expect(numTexts).toContain('1.');
    expect(numTexts).toContain('2.');
    expect(numTexts).toContain('3.');
  });

  // ── Drop detection ─────────────────────────────────────────────────────────

  it('marks the dropped node (#3 Standards) with .cell-drop and renders .badge-drop', () => {
    const { sheetId } = setupScenario();
    render(<FlowGrid sheetId={sheetId} />);

    // "Standards" is the dropped 2AC child
    const cell = screen.getByText('Standards').closest('td');
    expect(cell).toBeDefined();
    expect(cell!.classList.contains('cell-drop')).toBe(true);

    // badge-drop should exist somewhere in the DOM
    const badge = document.querySelector('.badge-drop');
    expect(badge).not.toBeNull();
  });

  // ── Selected cell ──────────────────────────────────────────────────────────

  it('highlights the selected cell with .cell-sel', () => {
    const { sheetId, ac2Id } = setupScenario();
    const fmt = useRoundStore.getState().round!.format;
    const s2AC = fmt.speeches[2].id;

    // Set selection to ac2 (Counter-interp)
    useRoundStore.getState().setSelection({ sheetId, speechId: s2AC, nodeId: ac2Id });

    render(<FlowGrid sheetId={sheetId} />);

    const cell = screen.getByText('Counter-interp').closest('td');
    expect(cell).toBeDefined();
    expect(cell!.classList.contains('cell-sel')).toBe(true);
  });

  // ── Empty sheet fallback ───────────────────────────────────────────────────

  it('renders at least one row even when the sheet has no nodes', () => {
    const fmt = makeFormatByKey('policy');
    useRoundStore.getState().createRound({ role: 'neg', format: fmt, meta: {} });
    const sheetId = useRoundStore.getState().addSheet({ title: 'Empty', group: 'case' });

    render(<FlowGrid sheetId={sheetId} />);

    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
  });
});
