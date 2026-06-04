/**
 * The action layer. Each action is applied by mutating the Boxes map, and
 * applyAction returns the action that exactly undoes it (identity on failure).
 * This is the foundation of undo/redo.
 */
import type { Box, Boxes } from "@/lib/editor/types";
import { descendants } from "@/lib/editor/boxes";

export type Action =
  | { tag: "add"; parentId: string; id: string; index: number; value: Box; children?: string[] }
  | { tag: "delete"; id: string }
  | { tag: "update"; id: string; value: Box }
  | { tag: "move"; id: string; newParentId: string; newIndex: number }
  | { tag: "replace"; boxes: Boxes }
  | { tag: "identity" };

export type ActionBundle = Action[];

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

/** Applies `action` (mutating `boxes`) and returns its inverse. */
export function applyAction(boxes: Boxes, action: Action): Action {
  switch (action.tag) {
    case "add": {
      const parent = boxes[action.parentId];
      if (!parent) return { tag: "identity" };
      boxes[action.id] = {
        value: action.value,
        parentId: action.parentId,
        children: action.children ? [...action.children] : [],
      };
      parent.children.splice(clampIndex(action.index, parent.children.length), 0, action.id);
      return { tag: "delete", id: action.id };
    }
    case "delete": {
      // Single-node primitive: deletes only this node. To remove a node WITH its
      // subtree, use decorate.deleteBoxBundle (deepest-first) — a bare parent
      // delete here would orphan its children in the map.
      const node = boxes[action.id];
      if (!node || node.parentId === null) return { tag: "identity" }; // never delete a root
      const parent = boxes[node.parentId];
      if (!parent) return { tag: "identity" };
      const index = parent.children.indexOf(action.id);
      if (index === -1) return { tag: "identity" };
      const inverse: Action = {
        tag: "add",
        parentId: node.parentId,
        id: action.id,
        index,
        value: node.value,
        children: [...node.children],
      };
      parent.children.splice(index, 1);
      delete boxes[action.id];
      return inverse;
    }
    case "update": {
      const node = boxes[action.id];
      if (!node) return { tag: "identity" };
      const inverse: Action = { tag: "update", id: action.id, value: node.value };
      node.value = action.value;
      return inverse;
    }
    case "move": {
      const node = boxes[action.id];
      if (!node || node.parentId === null) return { tag: "identity" };
      // Reject moves that would create a cycle (into self or own descendant).
      if (
        action.newParentId === action.id ||
        descendants(boxes, action.id).includes(action.newParentId)
      ) {
        return { tag: "identity" };
      }
      const oldParent = boxes[node.parentId];
      if (!oldParent) return { tag: "identity" };
      const oldIndex = oldParent.children.indexOf(action.id);
      if (oldIndex === -1) return { tag: "identity" };
      const newParent = boxes[action.newParentId];
      if (!newParent) return { tag: "identity" };
      const inverse: Action = {
        tag: "move",
        id: action.id,
        newParentId: node.parentId,
        newIndex: oldIndex,
      };
      oldParent.children.splice(oldIndex, 1);
      node.parentId = action.newParentId;
      newParent.children.splice(
        clampIndex(action.newIndex, newParent.children.length),
        0,
        action.id,
      );
      return inverse;
    }
    case "replace": {
      const inverse: Action = { tag: "replace", boxes: structuredClone(boxes) };
      for (const key of Object.keys(boxes)) delete boxes[key];
      for (const key of Object.keys(action.boxes)) boxes[key] = structuredClone(action.boxes[key]);
      return inverse;
    }
    case "identity":
      return action;
  }
}

/** Applies a bundle in order; returns the reversed inverse bundle. */
export function applyActionBundle(boxes: Boxes, bundle: ActionBundle): ActionBundle {
  const inverse: Action[] = [];
  for (const action of bundle) inverse.push(applyAction(boxes, action));
  return inverse.reverse();
}
