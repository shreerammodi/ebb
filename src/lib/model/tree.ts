/**
 * Pure clash-tree operations.
 *
 * All functions are pure: they take an array of ArgumentNode and return
 * new arrays without mutating their input.
 */

import type { ArgumentNode, NodeStatus } from '@/lib/model/types';
import { uid } from '@/lib/model/ids';

/**
 * Returns children of a node (nodes whose parentId === parentId and
 * sheetId === sheetId), sorted ascending by order.
 */
export function childrenOf(
  nodes: ArgumentNode[],
  parentId: string,
  sheetId: string,
): ArgumentNode[] {
  return nodes
    .filter(n => n.parentId === parentId && n.sheetId === sheetId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Returns root-level nodes (parentId === null) for the given sheet and speech,
 * sorted ascending by order.
 */
export function rootsOf(
  nodes: ArgumentNode[],
  sheetId: string,
  speechId: string,
): ArgumentNode[] {
  return nodes
    .filter(n => n.parentId === null && n.sheetId === sheetId && n.speechId === speechId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Creates a new ArgumentNode and returns the updated nodes array alongside
 * the created node.
 *
 * Order is computed as (max order among nodes in the same sheet+speech column) + 1,
 * or 0 if none exist.
 */
export function addNode(
  nodes: ArgumentNode[],
  input: {
    sheetId: string;
    speechId: string;
    parentId: string | null;
    text?: string;
  },
): { nodes: ArgumentNode[]; node: ArgumentNode } {
  const column = nodes.filter(
    n => n.sheetId === input.sheetId && n.speechId === input.speechId,
  );
  const maxOrder = column.length > 0 ? Math.max(...column.map(n => n.order)) : -1;

  const node: ArgumentNode = {
    id: uid('node'),
    sheetId: input.sheetId,
    speechId: input.speechId,
    parentId: input.parentId,
    order: maxOrder + 1,
    text: input.text ?? '',
    statuses: [],
    numberOverride: null,
  };

  return { nodes: [...nodes, node], node };
}

/**
 * Returns a new array with the target node's parentId updated and its
 * numberOverride reset to null.
 */
export function setParent(
  nodes: ArgumentNode[],
  nodeId: string,
  parentId: string | null,
): ArgumentNode[] {
  return nodes.map(n =>
    n.id === nodeId ? { ...n, parentId, numberOverride: null } : n,
  );
}

/**
 * Returns a new array with the target node's text updated.
 */
export function updateText(
  nodes: ArgumentNode[],
  nodeId: string,
  text: string,
): ArgumentNode[] {
  return nodes.map(n => (n.id === nodeId ? { ...n, text } : n));
}

/**
 * Toggles a status on the target node: adds if absent, removes if present.
 */
export function toggleStatus(
  nodes: ArgumentNode[],
  nodeId: string,
  status: NodeStatus,
): ArgumentNode[] {
  return nodes.map(n => {
    if (n.id !== nodeId) return n;
    const hasStatus = n.statuses.includes(status);
    const statuses = hasStatus
      ? n.statuses.filter(s => s !== status)
      : [...n.statuses, status];
    return { ...n, statuses };
  });
}

/**
 * Removes the target node and re-parents its direct children to the removed
 * node's parentId (so sub-answers are not orphaned).
 * Children of children are untouched (they still point at their parents).
 */
export function removeNode(
  nodes: ArgumentNode[],
  nodeId: string,
): ArgumentNode[] {
  const target = nodes.find(n => n.id === nodeId);
  if (!target) return [...nodes];

  const grandparentId = target.parentId;

  return nodes
    .filter(n => n.id !== nodeId)
    .map(n =>
      n.parentId === nodeId ? { ...n, parentId: grandparentId } : n,
    );
}

/**
 * Sets a node's order to newOrder (simple reorder; no renormalization).
 */
export function moveNode(
  nodes: ArgumentNode[],
  nodeId: string,
  newOrder: number,
): ArgumentNode[] {
  return nodes.map(n => (n.id === nodeId ? { ...n, order: newOrder } : n));
}
