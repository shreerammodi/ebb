/**
 * Pure helpers over the Boxes map. No mutation, no store access.
 */
import { uid } from "@/lib/model/ids";
import type { Box, BoxNode, Boxes } from "@/lib/editor/types";

export function newBox(overrides: Partial<Box> = {}): Box {
  return {
    content: "",
    empty: false,
    crossed: false,
    bold: false,
    isExtension: false,
    ...overrides,
  };
}

export function newBoxId(): string {
  return uid("box");
}

export function getNode(boxes: Boxes, id: string): BoxNode | null {
  return boxes[id] ?? null;
}

export function childIds(boxes: Boxes, id: string): string[] {
  return boxes[id]?.children ?? [];
}

/** Parent ids from id up to (and including) the root, cycle-guarded. */
export function ancestors(boxes: Boxes, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let p = boxes[id]?.parentId ?? null;
  while (p !== null && !seen.has(p)) {
    seen.add(p);
    out.push(p);
    p = boxes[p]?.parentId ?? null;
  }
  return out;
}

/** Column index: root children are 0; the root itself is -1. */
export function columnOf(boxes: Boxes, id: string): number {
  return ancestors(boxes, id).length - 1;
}

/** Number of leaves in the subtree rooted at id (a leaf counts as 1). */
export function leafCount(boxes: Boxes, id: string): number {
  const node = boxes[id];
  if (!node || node.children.length === 0) return 1;
  let sum = 0;
  for (const c of node.children) sum += leafCount(boxes, c);
  return sum;
}

/** All descendant ids (excludes id itself). */
export function descendants(boxes: Boxes, id: string): string[] {
  const out: string[] = [];
  const stack = [...(boxes[id]?.children ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(boxes[cur]?.children ?? []));
  }
  return out;
}

/** Index of id within its parent's children, or -1 (root / detached). */
export function indexInParent(boxes: Boxes, id: string): number {
  const p = boxes[id]?.parentId;
  if (p == null) return -1;
  return boxes[p]?.children.indexOf(id) ?? -1;
}
