/**
 * Node-centric navigation helpers.
 *
 * These operate directly on the flat `ArgumentNode[]` array (NOT on the
 * FlowGrid rowspan layout). They are pure: no mutation, no store access.
 */

import type { ArgumentNode, Format, Speech } from "@/lib/model/types";

/** Returns the parent node of nodeId, or null. */
export function parentOf(nodes: ArgumentNode[], nodeId: string): ArgumentNode | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.parentId === null) return null;
  return nodes.find((n) => n.id === node.parentId) ?? null;
}

/**
 * Returns the child with minimum order among all nodes whose
 * parentId === nodeId and sheetId === sheetId. Children may span speeches,
 * so this does not filter by speechId.
 */
export function firstChildOf(
  nodes: ArgumentNode[],
  nodeId: string,
  sheetId: string,
): ArgumentNode | null {
  const children = nodes.filter((n) => n.parentId === nodeId && n.sheetId === sheetId);
  if (children.length === 0) return null;
  return children.reduce((best, n) => (n.order < best.order ? n : best));
}

/**
 * Returns the node with the next-lower order in the same (sheetId, speechId)
 * column as `node`, or null if `node` is at the top.
 */
export function nodeAboveInColumn(nodes: ArgumentNode[], node: ArgumentNode): ArgumentNode | null {
  const above = nodes.filter(
    (n) => n.sheetId === node.sheetId && n.speechId === node.speechId && n.order < node.order,
  );
  if (above.length === 0) return null;
  return above.reduce((best, n) => (n.order > best.order ? n : best));
}

/**
 * Returns the node with the next-higher order in the same (sheetId, speechId)
 * column as `node`, or null if `node` is at the bottom.
 */
export function nodeBelowInColumn(nodes: ArgumentNode[], node: ArgumentNode): ArgumentNode | null {
  const below = nodes.filter(
    (n) => n.sheetId === node.sheetId && n.speechId === node.speechId && n.order > node.order,
  );
  if (below.length === 0) return null;
  return below.reduce((best, n) => (n.order < best.order ? n : best));
}

/**
 * Given a format and a speechId, returns the first speech after speechId that
 * belongs to the opposite side, or null.
 */
export function nextOpposingSpeech(format: Format, speechId: string): Speech | null {
  const index = format.speeches.findIndex((s) => s.id === speechId);
  if (index === -1) return null;
  const side = format.speeches[index].side;
  for (let i = index + 1; i < format.speeches.length; i++) {
    if (format.speeches[i].side !== side) return format.speeches[i];
  }
  return null;
}
