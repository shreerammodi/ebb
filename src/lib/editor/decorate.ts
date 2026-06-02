/**
 * High-level edit operations. Each returns an ActionBundle (and, for adds, the
 * new box id for focusing). They enforce structural rules but do not apply or
 * record — the store does that, wrapping the bundle in history.
 */
import type { Boxes } from '@/lib/editor/types';
import type { Action, ActionBundle } from '@/lib/editor/action';
import { newBox, newBoxId, columnOf, descendants, indexInParent } from '@/lib/editor/boxes';

export interface AddResult {
  bundle: ActionBundle;
  newId: string;
}

/** Add an empty-content sibling next to `id`. dir 1 = below, -1 (or 0) = at id's index. */
export function addSiblingBundle(boxes: Boxes, id: string, dir: 1 | -1): AddResult | null {
  const node = boxes[id];
  if (!node || node.parentId === null) return null; // can't add a sibling to a root
  const index = indexInParent(boxes, id);
  if (index === -1) return null;
  const newId = newBoxId();
  const insertIndex = dir === 1 ? index + 1 : index;
  return {
    bundle: [{ tag: 'add', parentId: node.parentId, id: newId, index: insertIndex, value: newBox() }],
    newId,
  };
}

/** Add a child to `id` in the next column, unless that would exceed columnCount. */
export function addChildBundle(boxes: Boxes, id: string, index: number, columnCount: number): AddResult | null {
  const node = boxes[id];
  if (!node) return null;
  if (columnOf(boxes, id) + 1 >= columnCount) return null; // child would be past the last column
  const newId = newBoxId();
  return {
    bundle: [{ tag: 'add', parentId: id, id: newId, index, value: newBox() }],
    newId,
  };
}

/** Add an extension node as the first child of `id`, unless one already exists. */
export function addExtensionBundle(boxes: Boxes, id: string, columnCount: number): AddResult | null {
  const node = boxes[id];
  if (!node) return null;
  const firstChild = node.children[0];
  if (firstChild && boxes[firstChild]?.value.isExtension) return null; // already has one
  if (columnOf(boxes, id) + 1 >= columnCount) return null;
  const newId = newBoxId();
  return {
    bundle: [{ tag: 'add', parentId: id, id: newId, index: 0, value: newBox({ isExtension: true }) }],
    newId,
  };
}

/** Delete `id` and its whole subtree, deepest column first (keeps the inverse faithful). */
export function deleteBoxBundle(boxes: Boxes, id: string): ActionBundle {
  const node = boxes[id];
  if (!node || node.parentId === null) return []; // never delete a root
  const ids = [...descendants(boxes, id), id];
  ids.sort((x, y) => columnOf(boxes, y) - columnOf(boxes, x)); // deepest first
  return ids.map((x): Action => ({ tag: 'delete', id: x }));
}

function toggleFlagBundle(boxes: Boxes, id: string, flag: 'crossed' | 'bold'): ActionBundle {
  const node = boxes[id];
  if (!node) return [];
  return [{ tag: 'update', id, value: { ...node.value, [flag]: !node.value[flag] } }];
}

export function toggleCrossedBundle(boxes: Boxes, id: string): ActionBundle {
  return toggleFlagBundle(boxes, id, 'crossed');
}

export function toggleBoldBundle(boxes: Boxes, id: string): ActionBundle {
  return toggleFlagBundle(boxes, id, 'bold');
}
