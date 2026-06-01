'use client';

/**
 * FlowGrid — elastic debate flow table for a single sheet.
 *
 * Renders a <table class="flow"> with:
 *   - (Optional) top header row for speech groups (e.g. "Neg block")
 *   - Bottom header row with speech names + side classes
 *   - Body rows computed by the tree → rowspan layout algorithm
 *
 * ASSUMPTION: responses always live in a LATER column than their parent
 * (debate-natural). Same-column parent/child relationships are not exercised
 * by tests and would collapse gracefully into separate rows.
 */

import type { ArgumentNode, Speech } from '@/lib/model/types';
import { useRoundStore, selectSheetNodes, selectDrops } from '@/lib/store/useRoundStore';
import GridCell from './GridCell';

// ─── Types used internally ────────────────────────────────────────────────────

interface PlacedNode {
  node: ArgumentNode;
  startRow: number;
  rowSpan: number;
  col: number;
}

// ─── Layout algorithm ─────────────────────────────────────────────────────────

function buildLayout(
  nodes: ArgumentNode[],
  speeches: Speech[],
): { placed: PlacedNode[]; totalRows: number } {
  if (nodes.length === 0) {
    return { placed: [], totalRows: 0 };
  }

  // Map speechId → column index
  const colIndex = new Map<string, number>(speeches.map((s, i) => [s.id, i]));

  // Build children map
  const childrenByParent = new Map<string | null, ArgumentNode[]>();
  for (const node of nodes) {
    const key = node.parentId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(node);
  }
  // Sort children by order
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.order - b.order);
  }

  // Roots: nodes with parentId === null, sorted by (col, order)
  const roots = (childrenByParent.get(null) ?? []).slice().sort((a, b) => {
    const ca = colIndex.get(a.speechId) ?? 0;
    const cb = colIndex.get(b.speechId) ?? 0;
    return ca !== cb ? ca - cb : a.order - b.order;
  });

  // Leaf count (memoized)
  const leafCountCache = new Map<string, number>();
  function leafCount(node: ArgumentNode): number {
    if (leafCountCache.has(node.id)) return leafCountCache.get(node.id)!;
    const children = childrenByParent.get(node.id) ?? [];
    const count = children.length === 0 ? 1 : children.reduce((s, c) => s + leafCount(c), 0);
    leafCountCache.set(node.id, count);
    return count;
  }

  // Place each node via DFS
  const placed: PlacedNode[] = [];
  const visited = new Set<string>(); // cycle guard

  function place(node: ArgumentNode, startRow: number): void {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const col = colIndex.get(node.speechId) ?? 0;
    const rowSpan = leafCount(node);
    placed.push({ node, startRow, rowSpan, col });

    const children = childrenByParent.get(node.id) ?? [];
    let cursor = startRow;
    for (const child of children) {
      place(child, cursor);
      cursor += leafCount(child);
    }
  }

  let totalRows = 0;
  for (const root of roots) {
    place(root, totalRows);
    totalRows += leafCount(root);
  }

  return { placed, totalRows };
}

// ─── FlowGrid component ───────────────────────────────────────────────────────

export interface FlowGridProps {
  sheetId: string;
}

export default function FlowGrid({ sheetId }: FlowGridProps) {
  const round = useRoundStore(s => s.round);
  const selection = useRoundStore(s => s.selection);
  const setSelection = useRoundStore(s => s.setSelection);

  if (!round) return null;

  const { format } = round;
  const speeches = format.speeches;
  const numCols = speeches.length;

  const nodes = selectSheetNodes(round, sheetId);
  const droppedIds = new Set(selectDrops(round, sheetId));

  // ── Compute group header info ──────────────────────────────────────────────
  // Build "top header" cells: runs of same non-empty group get a colSpan header;
  // ungrouped speeches each get an empty cell.
  interface TopCell {
    label: string;
    span: number;
  }
  const topCells: TopCell[] = [];
  let i = 0;
  let hasGroups = false;
  while (i < speeches.length) {
    const g = speeches[i].group;
    if (g) {
      // count consecutive speeches with the same group
      let j = i;
      while (j < speeches.length && speeches[j].group === g) j++;
      topCells.push({ label: g, span: j - i });
      i = j;
      hasGroups = true;
    } else {
      topCells.push({ label: '', span: 1 });
      i++;
    }
  }

  // ── Build layout ───────────────────────────────────────────────────────────
  const { placed, totalRows } = buildLayout(nodes, speeches);

  // Build lookup: (row, col) → PlacedNode or 'covered' or undefined
  const cellMap = new Map<string, PlacedNode | 'covered'>();
  for (const p of placed) {
    cellMap.set(`${p.startRow},${p.col}`, p);
    for (let r = p.startRow + 1; r < p.startRow + p.rowSpan; r++) {
      cellMap.set(`${r},${p.col}`, 'covered');
    }
  }

  const effectiveRows = Math.max(totalRows, 1);

  // Children lookup (for arg-parent class)
  const hasChildrenSet = new Set<string>();
  for (const node of nodes) {
    if (node.parentId !== null) hasChildrenSet.add(node.parentId);
  }

  return (
    <table className="flow">
      <thead>
        {hasGroups && (
          <tr>
            {topCells.map((cell, idx) =>
              cell.label ? (
                <th key={idx} colSpan={cell.span} className="side-neg">
                  {cell.label}
                </th>
              ) : (
                <th key={idx} />
              ),
            )}
          </tr>
        )}
        <tr>
          {speeches.map(speech => (
            <th
              key={speech.id}
              className={speech.side === 'aff' ? 'side-aff' : 'side-neg'}
            >
              {speech.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: effectiveRows }, (_, row) => (
          <tr key={row}>
            {speeches.map((speech, col) => {
              const entry = cellMap.get(`${row},${col}`);

              if (entry === 'covered') {
                // This cell is covered by a rowspan above — skip rendering it
                return null;
              }

              const sideClass = speech.side === 'aff' ? 'side-aff' : 'side-neg';

              if (entry) {
                // Render a node cell
                const { node, rowSpan } = entry;
                const isDropped = droppedIds.has(node.id);
                const isSelected =
                  selection?.sheetId === sheetId &&
                  selection?.speechId === speech.id &&
                  selection?.nodeId === node.id;

                const classes = [
                  sideClass,
                  isDropped ? 'cell-drop' : '',
                  isSelected ? 'cell-sel' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <td key={col} rowSpan={rowSpan} className={classes}>
                    <GridCell
                      node={node}
                      sheetId={sheetId}
                      speechId={speech.id}
                      isDropped={isDropped}
                      sheetNodes={nodes}
                      hasChildren={hasChildrenSet.has(node.id)}
                    />
                  </td>
                );
              }

              // Empty cell — dash placeholder, clickable to start a new arg
              const isSelected =
                selection?.sheetId === sheetId &&
                selection?.speechId === speech.id &&
                selection?.nodeId === '';

              const classes = [sideClass, isSelected ? 'cell-sel' : '']
                .filter(Boolean)
                .join(' ');

              return (
                <td
                  key={col}
                  className={classes}
                  onClick={() =>
                    setSelection({ sheetId, speechId: speech.id, nodeId: '' })
                  }
                >
                  <span className="dash">—</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
