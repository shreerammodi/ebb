/**
 * Coalesced text edits. While typing, the latest content is held as a
 * PendingEdit; it is committed as a single update action on blur / focus change.
 */
import type { Boxes } from "@/lib/editor/types";
import type { Action } from "@/lib/editor/action";

export interface PendingEdit {
  boxId: string;
  content: string;
}

/** Build an update action that changes only the box's content. */
export function updateContentAction(boxes: Boxes, boxId: string, content: string): Action {
  const node = boxes[boxId];
  if (!node) return { tag: "identity" };
  return { tag: "update", id: boxId, value: { ...node.value, content } };
}

/**
 * Turn a pending edit into a single update action, or null if there is nothing
 * to commit (no pending edit, or content unchanged).
 */
export function resolvePending(boxes: Boxes, pending: PendingEdit | null): Action | null {
  if (!pending) return null;
  const node = boxes[pending.boxId];
  if (!node) return null;
  if (node.value.content === pending.content) return null;
  return { tag: "update", id: pending.boxId, value: { ...node.value, content: pending.content } };
}
