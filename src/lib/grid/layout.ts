/**
 * Elastic flow layout: turns the argument tree into (row, col, rowSpan) placements.
 * Extracted from FlowGrid so exporters reuse the exact on-screen placement.
 *
 * ASSUMPTION: responses always live in a LATER column than their parent.
 */

import type { ArgumentNode, Speech } from '@/lib/model/types';

export interface PlacedNode {
  node: ArgumentNode;
  startRow: number;
  rowSpan: number;
  col: number;
}

export function buildLayout(
  nodes: ArgumentNode[],
  speeches: Speech[],
): { placed: PlacedNode[]; totalRows: number } {
  if (nodes.length === 0) {
    return { placed: [], totalRows: 0 };
  }

  // Map speechId → column index
  const colIndex = new Map<string, number>(speeches.map((s, i) => [s.id, i]));

  // M3: filter out nodes whose speechId doesn't exist in the format
  const validNodes = nodes.filter(n => colIndex.has(n.speechId));

  // Build children map
  const childrenByParent = new Map<string | null, ArgumentNode[]>();
  for (const node of validNodes) {
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

  // Leaf count (memoized) with cycle guard
  const leafCountCache = new Map<string, number>();
  function leafCount(node: ArgumentNode, visiting: Set<string> = new Set()): number {
    if (leafCountCache.has(node.id)) return leafCountCache.get(node.id)!;
    // Cycle guard: if we've already entered this node on the current path, treat as leaf
    if (visiting.has(node.id)) return 1;
    visiting.add(node.id);
    const children = childrenByParent.get(node.id) ?? [];
    const count = children.length === 0 ? 1 : children.reduce((s, c) => s + leafCount(c, visiting), 0);
    visiting.delete(node.id);
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
