/**
 * Tree navigation, ported from the reference's getAdjacentBox.
 * Pure: operates only on the Boxes map.
 */
import type { Boxes } from "@/lib/editor/types";

/**
 * The box visually above ('up') or below ('down') `id`, walking across nesting:
 * within a parent it is the prev/next sibling; at a parent's edge it descends
 * into the adjacent parent's children (skipping childless parents).
 * Returns null at the very top/bottom of the sheet.
 */
export function getAdjacentBox(boxes: Boxes, id: string, dir: "up" | "down"): string | null {
  const node = boxes[id];
  if (!node || node.parentId === null) return null; // root has no adjacency
  const parent = boxes[node.parentId];
  if (!parent) return null;

  const index = parent.children.indexOf(id);
  const newIndex = dir === "up" ? index - 1 : index + 1;

  if (newIndex < 0 || newIndex >= parent.children.length) {
    // Out of range here: find the adjacent parent and dive into its children.
    let adjacentParent = getAdjacentBox(boxes, node.parentId, dir);
    if (adjacentParent === null) return null;
    while ((boxes[adjacentParent]?.children.length ?? 0) === 0) {
      adjacentParent = getAdjacentBox(boxes, adjacentParent, dir);
      if (adjacentParent === null) return null;
    }
    const target = boxes[adjacentParent]!;
    return dir === "up" ? target.children[target.children.length - 1] : target.children[0];
  }

  return parent.children[newIndex];
}

/** Like getAdjacentBox, but skips empty (spacer) boxes. */
export function adjacentNonEmpty(boxes: Boxes, id: string, dir: "up" | "down"): string | null {
  let cur = id;
  for (;;) {
    const next = getAdjacentBox(boxes, cur, dir);
    if (next === null) return null;
    if (boxes[next]?.value.empty) {
      cur = next;
      continue;
    }
    return next;
  }
}

/** First non-empty child of `id`, or null. */
export function firstNonEmptyChild(boxes: Boxes, id: string): string | null {
  for (const c of boxes[id]?.children ?? []) {
    if (!boxes[c]?.value.empty) return c;
  }
  return null;
}

/** Parent id, or null when the parent is the sheet root (i.e. `id` is column 0). */
export function realParent(boxes: Boxes, id: string): string | null {
  const parentId = boxes[id]?.parentId ?? null;
  if (parentId === null) return null;
  if (boxes[parentId]?.parentId === null) return null; // parent is the root
  return parentId;
}
