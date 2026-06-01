/**
 * Parent-scoped argument numbering with break-point overrides.
 *
 * Pure function; no side effects, no UI/store imports.
 */

import type { ArgumentNode } from '@/lib/model/types';

/**
 * Returns the display number for a response node within its sibling group.
 *
 * Rules:
 * - Root nodes (parentId === null) are unnumbered → returns null.
 * - Siblings are all nodes sharing the same parentId, sheetId, and speechId,
 *   sorted ascending by order.
 * - A running counter starts at 0. For each sibling in order:
 *     - If numberOverride is a number → counter = numberOverride (break point).
 *     - Otherwise → counter = counter + 1.
 *   The sibling's number is the resulting counter value.
 * - Returns null if nodeId is not found in the array.
 */
export function numberFor(nodes: ArgumentNode[], nodeId: string): number | null {
  const target = nodes.find(n => n.id === nodeId);
  if (!target) return null;
  if (target.parentId === null) return null;

  // Collect siblings: same parent, sheet, and speech
  const siblings = nodes
    .filter(
      n =>
        n.parentId === target.parentId &&
        n.sheetId === target.sheetId &&
        n.speechId === target.speechId,
    )
    .sort((a, b) => a.order - b.order);

  let counter = 0;
  for (const sibling of siblings) {
    if (typeof sibling.numberOverride === 'number') {
      counter = sibling.numberOverride;
    } else {
      counter += 1;
    }
    if (sibling.id === nodeId) return counter;
  }

  // Should not be reachable since target is among siblings
  return null;
}
