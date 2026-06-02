# Editor Engine (Phase 1: Model + Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure model + editing engine for the reference-based editor rework — box tree, action/inverse layer, undo/redo history, coalesced edits, exhaustive navigation, and high-level edit operations — as a self-contained, fully unit-tested library.

**Architecture:** A per-sheet tree of `Box` nodes stored in a `Boxes` map (`id → { value, parentId, children[] }`), where a box's **column = its depth** below an invisible sheet-root. Every mutation is an `Action` whose application returns its exact inverse, enabling round-trip undo/redo. All modules are pure (no React, no store, no DOM) and live under a new `src/lib/editor/` namespace so the existing `src/lib/model/` app keeps building and its 312 tests stay green. Wiring into the store/UI happens in later phases.

**Tech Stack:** TypeScript, Vitest. Reuses `src/lib/model/ids.ts` (`uid`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-02-editor-reference-rework-design.md` (§1, §2 — and §4 navigation primitives).

---

## File Structure

All new, under `src/lib/editor/`:

- `types.ts` — `Box`, `BoxNode`, `Boxes`, `Sheet` types. No behavior.
- `boxes.ts` — pure tree helpers + box factories (`newBox`, `getNode`, `childIds`, `ancestors`, `columnOf`, `leafCount`, `descendants`, `indexInParent`).
- `action.ts` — `Action` union, `applyAction` (mutates, returns inverse), `applyActionBundle`.
- `history.ts` — `History` class: undo/redo stacks of inverse bundles with before/after focus.
- `pending.ts` — coalesced text edits: `PendingEdit`, `updateContentAction`, `resolvePending`.
- `navigation.ts` — `getAdjacentBox`, `adjacentNonEmpty`, `firstNonEmptyChild`, `realParent`.
- `decorate.ts` — high-level edit builders returning `ActionBundle`: add sibling/child/extension, delete subtree, toggle crossed/bold.

Each module has a sibling `*.test.ts`.

**Representation note:** The new engine uses a map-with-children-arrays (sibling order = array index), not the existing flat `ArgumentNode[]` with an `order` field. This is the reference's representation and removes a whole class of order-renormalization bugs. Each sheet's tree has one **root node** (a `BoxNode` with `parentId === null`) whose direct children are the column-0 boxes; the root is a container and is never rendered as a cell. `columnOf` returns `-1` for the root, `0` for its children, and so on.

---

## Task 1: Types (`src/lib/editor/types.ts`)

**Files:**
- Create: `src/lib/editor/types.ts`

- [ ] **Step 1: Write the types file**

```ts
/**
 * Editor model types (reference-based rework).
 *
 * A sheet's flow is a tree of `Box` nodes stored in a `Boxes` map keyed by id.
 * Sibling order is the order of ids in each node's `children` array.
 * A box's COLUMN is its depth below an invisible per-sheet root node:
 * the root's direct children are column 0, their children column 1, and so on.
 * Empty boxes act as spacers (they render blank and navigation skips them),
 * which is how an argument can "start" in a later speech column.
 */

/** The editable payload of a node. The sheet root also uses this shape (empty). */
export interface Box {
  content: string;
  /** Spacer: renders blank, skipped by navigation. */
  empty: boolean;
  /** Line-through (was: status 'conceded'). */
  crossed: boolean;
  bold: boolean;
  /** Arrow-icon extension node (was: status 'extended'). */
  isExtension: boolean;
}

/** A node in the tree: its value plus structural links. */
export interface BoxNode {
  value: Box;
  /** null only for a sheet root. */
  parentId: string | null;
  /** Ordered child ids. */
  children: string[];
}

/** The whole forest: every node (including sheet roots) keyed by id. */
export type Boxes = Record<string, BoxNode>;

/** A flow sheet (page). Columns come from the shared format.speeches. */
export interface Sheet {
  id: string;
  title: string;
  side: 'aff' | 'neg';
  /** Display order among sheets. */
  order: number;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/editor/types.ts
git commit -m "feat(editor): box tree model types"
```

---

## Task 2: Tree helpers + factories (`src/lib/editor/boxes.ts`)

**Files:**
- Create: `src/lib/editor/boxes.ts`
- Test: `src/lib/editor/boxes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Boxes } from '@/lib/editor/types';
import {
  newBox,
  getNode,
  childIds,
  ancestors,
  columnOf,
  leafCount,
  descendants,
  indexInParent,
} from '@/lib/editor/boxes';

// Tree:
// root
//  ├─ a (col 0)
//  │   ├─ a1 (col 1)
//  │   └─ a2 (col 1)
//  │        └─ a2x (col 2)
//  └─ b (col 0)
function fixture(): Boxes {
  return {
    root: { value: newBox({ empty: true }), parentId: null, children: ['a', 'b'] },
    a: { value: newBox(), parentId: 'root', children: ['a1', 'a2'] },
    a1: { value: newBox(), parentId: 'a', children: [] },
    a2: { value: newBox(), parentId: 'a', children: ['a2x'] },
    a2x: { value: newBox(), parentId: 'a2', children: [] },
    b: { value: newBox(), parentId: 'root', children: [] },
  };
}

describe('newBox', () => {
  it('defaults all flags false and content empty', () => {
    expect(newBox()).toEqual({ content: '', empty: false, crossed: false, bold: false, isExtension: false });
  });
  it('applies overrides', () => {
    expect(newBox({ content: 'hi', bold: true }).content).toBe('hi');
    expect(newBox({ bold: true }).bold).toBe(true);
  });
});

describe('getNode / childIds', () => {
  it('returns the node or null', () => {
    expect(getNode(fixture(), 'a')!.parentId).toBe('root');
    expect(getNode(fixture(), 'nope')).toBeNull();
  });
  it('childIds returns ordered children, [] for unknown', () => {
    expect(childIds(fixture(), 'a')).toEqual(['a1', 'a2']);
    expect(childIds(fixture(), 'nope')).toEqual([]);
  });
});

describe('ancestors / columnOf', () => {
  it('ancestors lists parents up to root', () => {
    expect(ancestors(fixture(), 'a2x')).toEqual(['a2', 'a', 'root']);
  });
  it('columnOf: root children are 0, deeper increments', () => {
    const b = fixture();
    expect(columnOf(b, 'a')).toBe(0);
    expect(columnOf(b, 'a2')).toBe(1);
    expect(columnOf(b, 'a2x')).toBe(2);
    expect(columnOf(b, 'root')).toBe(-1);
  });
  it('terminates on a cyclic parent chain', () => {
    const b: Boxes = {
      x: { value: newBox(), parentId: 'y', children: [] },
      y: { value: newBox(), parentId: 'x', children: [] },
    };
    expect(ancestors(b, 'x').length).toBeLessThanOrEqual(2);
  });
});

describe('leafCount', () => {
  it('counts subtree leaves; a leaf counts as 1', () => {
    const b = fixture();
    expect(leafCount(b, 'a1')).toBe(1);
    expect(leafCount(b, 'a2')).toBe(1); // single leaf descendant a2x
    expect(leafCount(b, 'a')).toBe(2);  // a1 + a2x
    expect(leafCount(b, 'root')).toBe(3); // a1 + a2x + b
  });
});

describe('descendants', () => {
  it('returns all descendant ids', () => {
    expect(descendants(fixture(), 'a').sort()).toEqual(['a1', 'a2', 'a2x']);
    expect(descendants(fixture(), 'b')).toEqual([]);
  });
});

describe('indexInParent', () => {
  it('returns position among siblings, -1 for root', () => {
    expect(indexInParent(fixture(), 'b')).toBe(1);
    expect(indexInParent(fixture(), 'a1')).toBe(0);
    expect(indexInParent(fixture(), 'root')).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/boxes.test.ts`
Expected: FAIL — module `@/lib/editor/boxes` not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Pure helpers over the Boxes map. No mutation, no store access.
 */
import { uid } from '@/lib/model/ids';
import type { Box, BoxNode, Boxes } from '@/lib/editor/types';

export function newBox(overrides: Partial<Box> = {}): Box {
  return { content: '', empty: false, crossed: false, bold: false, isExtension: false, ...overrides };
}

export function newBoxId(): string {
  return uid('box');
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/boxes.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/boxes.ts src/lib/editor/boxes.test.ts
git commit -m "feat(editor): pure box-tree helpers and factories"
```

---

## Task 3: Action layer (`src/lib/editor/action.ts`)

The heart of the engine: each applied action returns its exact inverse.

**Files:**
- Create: `src/lib/editor/action.ts`
- Test: `src/lib/editor/action.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Boxes } from '@/lib/editor/types';
import { newBox } from '@/lib/editor/boxes';
import { applyAction, applyActionBundle, type Action } from '@/lib/editor/action';

function base(): Boxes {
  return {
    root: { value: newBox({ empty: true }), parentId: null, children: ['a', 'b'] },
    a: { value: newBox({ content: 'A' }), parentId: 'root', children: [] },
    b: { value: newBox({ content: 'B' }), parentId: 'root', children: [] },
  };
}

// Apply an action then its returned inverse; expect the map to match the start.
function roundTrips(boxes: Boxes, action: Action): boolean {
  const before = structuredClone(boxes);
  const inverse = applyAction(boxes, action);
  applyAction(boxes, inverse);
  return JSON.stringify(boxes) === JSON.stringify(before);
}

describe('applyAction: add', () => {
  it('inserts a child at the index and returns a delete inverse', () => {
    const b = base();
    const inv = applyAction(b, { tag: 'add', parentId: 'root', id: 'c', index: 1, value: newBox({ content: 'C' }) });
    expect(b.root.children).toEqual(['a', 'c', 'b']);
    expect(b.c.parentId).toBe('root');
    expect(inv).toEqual({ tag: 'delete', id: 'c' });
  });
  it('round-trips', () => {
    expect(roundTrips(base(), { tag: 'add', parentId: 'a', id: 'c', index: 0, value: newBox() })).toBe(true);
  });
  it('returns identity when parent is missing', () => {
    const b = base();
    expect(applyAction(b, { tag: 'add', parentId: 'ghost', id: 'c', index: 0, value: newBox() })).toEqual({ tag: 'identity' });
    expect(b.c).toBeUndefined();
  });
});

describe('applyAction: delete', () => {
  it('removes the node and returns an add inverse capturing children', () => {
    const b = base();
    b.a.children = ['a1'];
    b.a1 = { value: newBox({ content: 'A1' }), parentId: 'a', children: [] };
    const inv = applyAction(b, { tag: 'delete', id: 'a' });
    expect(b.a).toBeUndefined();
    expect(b.root.children).toEqual(['b']);
    expect(inv).toEqual({ tag: 'add', parentId: 'root', id: 'a', index: 0, value: b.a1 ? expect.any(Object) : undefined, children: ['a1'] });
  });
  it('round-trips a leaf delete', () => {
    expect(roundTrips(base(), { tag: 'delete', id: 'a' })).toBe(true);
  });
  it('refuses to delete a root (identity)', () => {
    const b = base();
    expect(applyAction(b, { tag: 'delete', id: 'root' })).toEqual({ tag: 'identity' });
    expect(b.root).toBeDefined();
  });
});

describe('applyAction: update', () => {
  it('replaces value and returns the prior value', () => {
    const b = base();
    const inv = applyAction(b, { tag: 'update', id: 'a', value: newBox({ content: 'A!' }) });
    expect(b.a.value.content).toBe('A!');
    expect(inv).toEqual({ tag: 'update', id: 'a', value: newBox({ content: 'A' }) });
  });
  it('round-trips', () => {
    expect(roundTrips(base(), { tag: 'update', id: 'a', value: newBox({ content: 'X', bold: true }) })).toBe(true);
  });
});

describe('applyAction: move', () => {
  it('reparents and reindexes, returning the inverse move', () => {
    const b = base();
    b.a.children = ['a1'];
    b.a1 = { value: newBox(), parentId: 'a', children: [] };
    const inv = applyAction(b, { tag: 'move', id: 'a1', newParentId: 'root', newIndex: 0 });
    expect(b.a1.parentId).toBe('root');
    expect(b.root.children).toEqual(['a1', 'a', 'b']);
    expect(b.a.children).toEqual([]);
    expect(inv).toEqual({ tag: 'move', id: 'a1', newParentId: 'a', newIndex: 0 });
  });
  it('round-trips a same-parent reorder', () => {
    const b = base();
    b.root.children = ['a', 'b', 'c', 'd'];
    b.c = { value: newBox(), parentId: 'root', children: [] };
    b.d = { value: newBox(), parentId: 'root', children: [] };
    expect(roundTrips(b, { tag: 'move', id: 'b', newParentId: 'root', newIndex: 3 })).toBe(true);
  });
});

describe('applyActionBundle', () => {
  it('applies in order and returns the reversed inverse bundle', () => {
    const b = base();
    const inverse = applyActionBundle(b, [
      { tag: 'update', id: 'a', value: newBox({ content: 'A2' }) },
      { tag: 'delete', id: 'b' },
    ]);
    expect(b.a.value.content).toBe('A2');
    expect(b.b).toBeUndefined();
    // reversed: first undo the delete (add), then undo the update
    expect(inverse[0].tag).toBe('add');
    expect(inverse[1].tag).toBe('update');
  });
  it('round-trips a multi-action bundle', () => {
    const b = base();
    const start = structuredClone(b);
    const inverse = applyActionBundle(b, [
      { tag: 'add', parentId: 'a', id: 'a1', index: 0, value: newBox({ content: 'A1' }) },
      { tag: 'update', id: 'b', value: newBox({ content: 'B2' }) },
    ]);
    applyActionBundle(b, inverse);
    expect(JSON.stringify(b)).toBe(JSON.stringify(start));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/action.test.ts`
Expected: FAIL — module `@/lib/editor/action` not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The action layer. Each action is applied by mutating the Boxes map, and
 * applyAction returns the action that exactly undoes it (identity on failure).
 * This is the foundation of undo/redo.
 */
import type { Box, Boxes } from '@/lib/editor/types';

export type Action =
  | { tag: 'add'; parentId: string; id: string; index: number; value: Box; children?: string[] }
  | { tag: 'delete'; id: string }
  | { tag: 'update'; id: string; value: Box }
  | { tag: 'move'; id: string; newParentId: string; newIndex: number }
  | { tag: 'replace'; boxes: Boxes }
  | { tag: 'identity' };

export type ActionBundle = Action[];

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

/** Applies `action` (mutating `boxes`) and returns its inverse. */
export function applyAction(boxes: Boxes, action: Action): Action {
  switch (action.tag) {
    case 'add': {
      const parent = boxes[action.parentId];
      if (!parent) return { tag: 'identity' };
      boxes[action.id] = {
        value: action.value,
        parentId: action.parentId,
        children: action.children ? [...action.children] : [],
      };
      parent.children.splice(clampIndex(action.index, parent.children.length), 0, action.id);
      return { tag: 'delete', id: action.id };
    }
    case 'delete': {
      const node = boxes[action.id];
      if (!node || node.parentId === null) return { tag: 'identity' }; // never delete a root
      const parent = boxes[node.parentId];
      if (!parent) return { tag: 'identity' };
      const index = parent.children.indexOf(action.id);
      if (index === -1) return { tag: 'identity' };
      const inverse: Action = {
        tag: 'add',
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
    case 'update': {
      const node = boxes[action.id];
      if (!node) return { tag: 'identity' };
      const inverse: Action = { tag: 'update', id: action.id, value: node.value };
      node.value = action.value;
      return inverse;
    }
    case 'move': {
      const node = boxes[action.id];
      if (!node || node.parentId === null) return { tag: 'identity' };
      const oldParent = boxes[node.parentId];
      if (!oldParent) return { tag: 'identity' };
      const oldIndex = oldParent.children.indexOf(action.id);
      if (oldIndex === -1) return { tag: 'identity' };
      const newParent = boxes[action.newParentId];
      if (!newParent) return { tag: 'identity' };
      const inverse: Action = { tag: 'move', id: action.id, newParentId: node.parentId, newIndex: oldIndex };
      oldParent.children.splice(oldIndex, 1);
      node.parentId = action.newParentId;
      newParent.children.splice(clampIndex(action.newIndex, newParent.children.length), 0, action.id);
      return inverse;
    }
    case 'replace': {
      const inverse: Action = { tag: 'replace', boxes: structuredClone(boxes) };
      for (const key of Object.keys(boxes)) delete boxes[key];
      for (const key of Object.keys(action.boxes)) boxes[key] = structuredClone(action.boxes[key]);
      return inverse;
    }
    case 'identity':
      return action;
  }
}

/** Applies a bundle in order; returns the reversed inverse bundle. */
export function applyActionBundle(boxes: Boxes, bundle: ActionBundle): ActionBundle {
  const inverse: Action[] = [];
  for (const action of bundle) inverse.push(applyAction(boxes, action));
  return inverse.reverse();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/action.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/action.ts src/lib/editor/action.test.ts
git commit -m "feat(editor): action layer with exact inverses"
```

---

## Task 4: History (`src/lib/editor/history.ts`)

Undo/redo stacks. History is store-agnostic: it stores inverse bundles and calls an `apply` callback (so it can be unit-tested with a plain map, and later driven by the store).

**Files:**
- Create: `src/lib/editor/history.ts`
- Test: `src/lib/editor/history.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Boxes } from '@/lib/editor/types';
import { newBox } from '@/lib/editor/boxes';
import { applyActionBundle, type ActionBundle } from '@/lib/editor/action';
import { History } from '@/lib/editor/history';

function base(): Boxes {
  return { root: { value: newBox({ empty: true }), parentId: null, children: [] } };
}

describe('History', () => {
  it('records, undoes, and redoes a single edit', () => {
    const boxes = base();
    const history = new History();
    const apply = (b: ActionBundle) => applyActionBundle(boxes, b);

    // Add box "a" and record the inverse.
    const inverse = applyActionBundle(boxes, [
      { tag: 'add', parentId: 'root', id: 'a', index: 0, value: newBox({ content: 'A' }) },
    ]);
    history.record(inverse, /*beforeFocus*/ null, /*afterFocus*/ 'a');

    expect(boxes.a).toBeDefined();
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    const undoFocus = history.undo(apply);
    expect(boxes.a).toBeUndefined();      // edit reverted
    expect(undoFocus).toBe(null);          // restores beforeFocus
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    const redoFocus = history.redo(apply);
    expect(boxes.a).toBeDefined();         // edit reapplied
    expect(redoFocus).toBe('a');           // restores afterFocus
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('recording a new edit clears the redo stack', () => {
    const boxes = base();
    const history = new History();
    const apply = (b: ActionBundle) => applyActionBundle(boxes, b);

    history.record(applyActionBundle(boxes, [{ tag: 'add', parentId: 'root', id: 'a', index: 0, value: newBox() }]), null, 'a');
    history.undo(apply);
    expect(history.canRedo()).toBe(true);

    history.record(applyActionBundle(boxes, [{ tag: 'add', parentId: 'root', id: 'b', index: 0, value: newBox() }]), null, 'b');
    expect(history.canRedo()).toBe(false);
  });

  it('undo/redo are no-ops on empty stacks', () => {
    const boxes = base();
    const history = new History();
    const apply = (b: ActionBundle) => applyActionBundle(boxes, b);
    expect(history.undo(apply)).toBe(null);
    expect(history.redo(apply)).toBe(null);
  });

  it('survives multiple undo/redo cycles (state matches original)', () => {
    const boxes = base();
    const history = new History();
    const apply = (b: ActionBundle) => applyActionBundle(boxes, b);
    const start = structuredClone(boxes);

    history.record(applyActionBundle(boxes, [{ tag: 'add', parentId: 'root', id: 'a', index: 0, value: newBox({ content: 'A' }) }]), null, 'a');
    history.undo(apply);
    history.redo(apply);
    history.undo(apply);
    expect(JSON.stringify(boxes)).toBe(JSON.stringify(start));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/history.test.ts`
Expected: FAIL — module `@/lib/editor/history` not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Undo/redo history. Stores inverse bundles plus the focus to restore.
 * It is store-agnostic: `undo`/`redo` take an `apply` callback that applies a
 * bundle to the live state and returns that bundle's inverse.
 */
import type { ActionBundle } from '@/lib/editor/action';

export interface HistoryEntry {
  /** Bundle that reverts the recorded edit. */
  inverse: ActionBundle;
  /** Focus to restore when this edit is undone. */
  beforeFocus: string | null;
  /** Focus to restore when this edit is redone. */
  afterFocus: string | null;
}

export type ApplyFn = (bundle: ActionBundle) => ActionBundle;

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  /** Record an applied edit. `inverse` is what `applyActionBundle` returned. */
  record(inverse: ActionBundle, beforeFocus: string | null, afterFocus: string | null): void {
    this.past.push({ inverse, beforeFocus, afterFocus });
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Undo the most recent edit. Returns the focus id to restore, or null. */
  undo(apply: ApplyFn): string | null {
    const entry = this.past.pop();
    if (!entry) return null;
    const redoInverse = apply(entry.inverse);
    this.future.push({ inverse: redoInverse, beforeFocus: entry.beforeFocus, afterFocus: entry.afterFocus });
    return entry.beforeFocus;
  }

  /** Redo the most recently undone edit. Returns the focus id to restore, or null. */
  redo(apply: ApplyFn): string | null {
    const entry = this.future.pop();
    if (!entry) return null;
    const undoInverse = apply(entry.inverse);
    this.past.push({ inverse: undoInverse, beforeFocus: entry.beforeFocus, afterFocus: entry.afterFocus });
    return entry.afterFocus;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/history.ts src/lib/editor/history.test.ts
git commit -m "feat(editor): undo/redo history with focus restore"
```

---

## Task 5: Pending (coalesced) text edits (`src/lib/editor/pending.ts`)

A text edit in progress is held as a `PendingEdit` and committed as one `update` action on blur/focus-change, so undo granularity is per-field-session, not per-keystroke.

**Files:**
- Create: `src/lib/editor/pending.ts`
- Test: `src/lib/editor/pending.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Boxes } from '@/lib/editor/types';
import { newBox } from '@/lib/editor/boxes';
import { updateContentAction, resolvePending } from '@/lib/editor/pending';

function base(): Boxes {
  return {
    root: { value: newBox({ empty: true }), parentId: null, children: ['a'] },
    a: { value: newBox({ content: 'old', bold: true }), parentId: 'root', children: [] },
  };
}

describe('updateContentAction', () => {
  it('builds an update that changes only content, preserving other flags', () => {
    const action = updateContentAction(base(), 'a', 'new');
    expect(action).toEqual({ tag: 'update', id: 'a', value: { content: 'new', empty: false, crossed: false, bold: true, isExtension: false } });
  });
  it('returns identity for a missing box', () => {
    expect(updateContentAction(base(), 'ghost', 'x')).toEqual({ tag: 'identity' });
  });
});

describe('resolvePending', () => {
  it('returns null when there is no pending edit', () => {
    expect(resolvePending(base(), null)).toBeNull();
  });
  it('returns an update action for a pending edit', () => {
    const action = resolvePending(base(), { boxId: 'a', content: 'typed' });
    expect(action).toEqual({ tag: 'update', id: 'a', value: { content: 'typed', empty: false, crossed: false, bold: true, isExtension: false } });
  });
  it('returns null (no-op) when content is unchanged', () => {
    expect(resolvePending(base(), { boxId: 'a', content: 'old' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/pending.test.ts`
Expected: FAIL — module `@/lib/editor/pending` not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Coalesced text edits. While typing, the latest content is held as a
 * PendingEdit; it is committed as a single update action on blur / focus change.
 */
import type { Boxes } from '@/lib/editor/types';
import type { Action } from '@/lib/editor/action';

export interface PendingEdit {
  boxId: string;
  content: string;
}

/** Build an update action that changes only the box's content. */
export function updateContentAction(boxes: Boxes, boxId: string, content: string): Action {
  const node = boxes[boxId];
  if (!node) return { tag: 'identity' };
  return { tag: 'update', id: boxId, value: { ...node.value, content } };
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
  return { tag: 'update', id: pending.boxId, value: { ...node.value, content: pending.content } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/pending.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/pending.ts src/lib/editor/pending.test.ts
git commit -m "feat(editor): coalesced pending text edits"
```

---

## Task 6: Navigation (`src/lib/editor/navigation.ts`)

Ported from the reference's `getAdjacentBox`: up/down traversal across nesting that walks to adjacent parents' children at column edges. This is the logic that eliminates the "cursor stuck at last node" bug class.

**Files:**
- Create: `src/lib/editor/navigation.ts`
- Test: `src/lib/editor/navigation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Boxes } from '@/lib/editor/types';
import { newBox } from '@/lib/editor/boxes';
import { getAdjacentBox, adjacentNonEmpty, firstNonEmptyChild, realParent } from '@/lib/editor/navigation';

// root
//  ├─ a (col0)  children: a1, a2
//  │   ├─ a1 (col1)
//  │   └─ a2 (col1)
//  └─ b (col0)  children: b1
//      └─ b1 (col1)
function fixture(): Boxes {
  return {
    root: { value: newBox({ empty: true }), parentId: null, children: ['a', 'b'] },
    a: { value: newBox(), parentId: 'root', children: ['a1', 'a2'] },
    a1: { value: newBox(), parentId: 'a', children: [] },
    a2: { value: newBox(), parentId: 'a', children: [] },
    b: { value: newBox(), parentId: 'root', children: ['b1'] },
    b1: { value: newBox(), parentId: 'b', children: [] },
  };
}

describe('getAdjacentBox', () => {
  it('moves between siblings', () => {
    expect(getAdjacentBox(fixture(), 'a1', 'down')).toBe('a2');
    expect(getAdjacentBox(fixture(), 'a2', 'up')).toBe('a1');
  });
  it('at the end of a parent, descends into the adjacent parent\'s children', () => {
    // a2 is the last child of a; down should jump to b's first child b1
    expect(getAdjacentBox(fixture(), 'a2', 'down')).toBe('b1');
    // b1 up should jump to a's last child a2
    expect(getAdjacentBox(fixture(), 'b1', 'up')).toBe('a2');
  });
  it('moves between column-0 boxes', () => {
    expect(getAdjacentBox(fixture(), 'a', 'down')).toBe('b');
    expect(getAdjacentBox(fixture(), 'b', 'up')).toBe('a');
  });
  it('returns null at the very top and bottom', () => {
    expect(getAdjacentBox(fixture(), 'a1', 'up')).toBe(null); // nothing above a1
    expect(getAdjacentBox(fixture(), 'b1', 'down')).toBe(null); // nothing below b1
    expect(getAdjacentBox(fixture(), 'a', 'up')).toBe(null);
    expect(getAdjacentBox(fixture(), 'b', 'down')).toBe(null);
  });
  it('skips adjacent parents that have no children', () => {
    const b = fixture();
    // insert an empty-children sibling "mid" between a and b at col 0
    b.root.children = ['a', 'mid', 'b'];
    b.mid = { value: newBox(), parentId: 'root', children: [] };
    // from a2 (last child of a), down should skip "mid" (no children) and reach b1
    expect(getAdjacentBox(b, 'a2', 'down')).toBe('b1');
  });
});

describe('adjacentNonEmpty', () => {
  it('skips empty (spacer) boxes', () => {
    const b = fixture();
    b.a.value = newBox({ empty: true }); // a is a spacer at col 0
    // from b up: getAdjacentBox(b)->a, but a is empty, so skip to ... nothing above a => null
    expect(adjacentNonEmpty(b, 'b', 'up')).toBe(null);
  });
  it('returns the next non-empty box', () => {
    expect(adjacentNonEmpty(fixture(), 'a', 'down')).toBe('b');
  });
});

describe('firstNonEmptyChild', () => {
  it('returns the first non-empty child', () => {
    expect(firstNonEmptyChild(fixture(), 'a')).toBe('a1');
  });
  it('skips leading empty children', () => {
    const b = fixture();
    b.a1.value = newBox({ empty: true });
    expect(firstNonEmptyChild(b, 'a')).toBe('a2');
  });
  it('returns null when there are no (non-empty) children', () => {
    expect(firstNonEmptyChild(fixture(), 'a1')).toBe(null);
  });
});

describe('realParent', () => {
  it('returns the parent id, or null when the parent is the root', () => {
    expect(realParent(fixture(), 'a1')).toBe('a');
    expect(realParent(fixture(), 'a')).toBe(null); // a's parent is the root
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/navigation.test.ts`
Expected: FAIL — module `@/lib/editor/navigation` not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Tree navigation, ported from the reference's getAdjacentBox.
 * Pure: operates only on the Boxes map.
 */
import type { Boxes } from '@/lib/editor/types';

/**
 * The box visually above ('up') or below ('down') `id`, walking across nesting:
 * within a parent it is the prev/next sibling; at a parent's edge it descends
 * into the adjacent parent's children (skipping childless parents).
 * Returns null at the very top/bottom of the sheet.
 */
export function getAdjacentBox(boxes: Boxes, id: string, dir: 'up' | 'down'): string | null {
  const node = boxes[id];
  if (!node || node.parentId === null) return null; // root has no adjacency
  const parent = boxes[node.parentId];
  if (!parent) return null;

  const index = parent.children.indexOf(id);
  const newIndex = dir === 'up' ? index - 1 : index + 1;

  if (newIndex < 0 || newIndex >= parent.children.length) {
    // Out of range here: find the adjacent parent and dive into its children.
    let adjacentParent = getAdjacentBox(boxes, node.parentId, dir);
    if (adjacentParent === null) return null;
    while ((boxes[adjacentParent]?.children.length ?? 0) === 0) {
      adjacentParent = getAdjacentBox(boxes, adjacentParent, dir);
      if (adjacentParent === null) return null;
    }
    const target = boxes[adjacentParent]!;
    return dir === 'up' ? target.children[target.children.length - 1] : target.children[0];
  }

  return parent.children[newIndex];
}

/** Like getAdjacentBox, but skips empty (spacer) boxes. */
export function adjacentNonEmpty(boxes: Boxes, id: string, dir: 'up' | 'down'): string | null {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/navigation.ts src/lib/editor/navigation.test.ts
git commit -m "feat(editor): tree navigation (getAdjacentBox + skips)"
```

---

## Task 7: High-level edit operations (`src/lib/editor/decorate.ts`)

Builders that translate user intents into `ActionBundle`s, enforcing the column-limit, extension-position, and subtree-delete rules. They return bundles (and any new box id for focus) but do **not** apply or record — that orchestration is the store's job in a later phase.

**Files:**
- Create: `src/lib/editor/decorate.ts`
- Test: `src/lib/editor/decorate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Boxes } from '@/lib/editor/types';
import { newBox } from '@/lib/editor/boxes';
import { applyActionBundle } from '@/lib/editor/action';
import {
  addSiblingBundle,
  addChildBundle,
  addExtensionBundle,
  deleteBoxBundle,
  toggleCrossedBundle,
  toggleBoldBundle,
} from '@/lib/editor/decorate';

// columnCount = 3 (e.g. a 3-speech format)
const COLS = 3;

// root
//  └─ a (col0)
//      └─ a1 (col1)
function fixture(): Boxes {
  return {
    root: { value: newBox({ empty: true }), parentId: null, children: ['a'] },
    a: { value: newBox({ content: 'A' }), parentId: 'root', children: ['a1'] },
    a1: { value: newBox({ content: 'A1' }), parentId: 'a', children: [] },
  };
}

describe('addSiblingBundle', () => {
  it('adds a sibling below (dir 1) and returns the new id', () => {
    const b = fixture();
    const res = addSiblingBundle(b, 'a', 1)!;
    applyActionBundle(b, res.bundle);
    expect(b.root.children).toEqual(['a', res.newId]);
    expect(b[res.newId].value.empty).toBe(false);
  });
  it('adds a sibling above (dir -1) at the box\'s index', () => {
    const b = fixture();
    const res = addSiblingBundle(b, 'a', -1)!;
    applyActionBundle(b, res.bundle);
    expect(b.root.children).toEqual([res.newId, 'a']);
  });
  it('returns null for a root', () => {
    expect(addSiblingBundle(fixture(), 'root', 1)).toBeNull();
  });
});

describe('addChildBundle', () => {
  it('adds a child in the next column and returns the new id', () => {
    const b = fixture();
    const res = addChildBundle(b, 'a', 0, COLS)!; // a is col0 -> child col1 < 3 ok
    applyActionBundle(b, res.bundle);
    expect(b.a.children[0]).toBe(res.newId);
  });
  it('returns null when the box is already in the last column', () => {
    const b = fixture(); // a1 is col1; child would be col2 < 3 -> still ok
    // Build a box at col2:
    const c = addChildBundle(b, 'a1', 0, COLS)!;
    applyActionBundle(b, c.bundle);
    const last = c.newId; // col2
    expect(addChildBundle(b, last, 0, COLS)).toBeNull(); // child would be col3, not allowed
  });
});

describe('addExtensionBundle', () => {
  it('inserts an isExtension child at index 0', () => {
    const b = fixture();
    const res = addExtensionBundle(b, 'a', COLS)!;
    applyActionBundle(b, res.bundle);
    expect(b.a.children[0]).toBe(res.newId);
    expect(b[res.newId].value.isExtension).toBe(true);
  });
  it('refuses a second extension (returns null)', () => {
    const b = fixture();
    const res = addExtensionBundle(b, 'a', COLS)!;
    applyActionBundle(b, res.bundle);
    expect(addExtensionBundle(b, 'a', COLS)).toBeNull();
  });
});

describe('deleteBoxBundle', () => {
  it('deletes the whole subtree (deepest first) and round-trips', () => {
    const b = fixture();
    const start = structuredClone(b);
    const bundle = deleteBoxBundle(b, 'a');
    // deepest-first: a1 before a
    expect(bundle.map(x => x.tag === 'delete' ? x.id : '')).toEqual(['a1', 'a']);
    const inverse = applyActionBundle(b, bundle);
    expect(b.a).toBeUndefined();
    expect(b.a1).toBeUndefined();
    applyActionBundle(b, inverse);
    expect(JSON.stringify(b)).toBe(JSON.stringify(start));
  });
  it('returns an empty bundle for a root', () => {
    expect(deleteBoxBundle(fixture(), 'root')).toEqual([]);
  });
});

describe('toggle bundles', () => {
  it('toggleCrossedBundle flips crossed', () => {
    const b = fixture();
    applyActionBundle(b, toggleCrossedBundle(b, 'a'));
    expect(b.a.value.crossed).toBe(true);
    applyActionBundle(b, toggleCrossedBundle(b, 'a'));
    expect(b.a.value.crossed).toBe(false);
  });
  it('toggleBoldBundle flips bold', () => {
    const b = fixture();
    applyActionBundle(b, toggleBoldBundle(b, 'a'));
    expect(b.a.value.bold).toBe(true);
  });
  it('toggle bundles are empty for a missing box', () => {
    expect(toggleCrossedBundle(fixture(), 'ghost')).toEqual([]);
    expect(toggleBoldBundle(fixture(), 'ghost')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/decorate.test.ts`
Expected: FAIL — module `@/lib/editor/decorate` not found.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/decorate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/decorate.ts src/lib/editor/decorate.test.ts
git commit -m "feat(editor): high-level edit operations (add/delete/toggle bundles)"
```

---

## Task 8: Full suite + typecheck gate

Confirm the whole engine and the existing app are green together.

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — the existing 312 tests plus the new `src/lib/editor/*` tests, all green. (The new modules are not yet imported by the app, so nothing existing changes.)

- [ ] **Step 2: Typecheck the project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no errors).

- [ ] **Step 3: Lint the new files**

Run: `npm run lint`
Expected: PASS (no new errors in `src/lib/editor/`).

- [ ] **Step 4: Commit any lint fixes (if needed)**

```bash
git add -A
git commit -m "chore(editor): lint/typecheck pass for phase-1 engine"
```

---

## Self-Review

**Spec coverage (spec §1, §2, §4-navigation):**
- §1 data model (`Box`, `Sheet`, column = depth, empty spacers) → Task 1 (types) + Task 2 (`columnOf`, factories). ✓
- §2 action/inverse layer → Task 3. ✓
- §2 history (undo/redo) → Task 4. ✓
- §2 coalesced text edits → Task 5. ✓
- §2/§4 navigation (`getAdjacentBox`, skip empties, edge handling) → Task 6. ✓
- §2 `decorate.ts` high-level helpers (addSibling/addChild/addExtension/deleteBox/toggleCrossed/toggleBold) → Task 7. ✓
- Numbering/drops overlays, renderer, store wiring, persistence, commands/keymap → **out of scope for this plan** (later phases 2–4), as stated.

**Placeholder scan:** none — every step has full code or an exact command.

**Type consistency:** `Box`/`BoxNode`/`Boxes` (Task 1) are used unchanged in Tasks 2–7. `Action`/`ActionBundle` (Task 3) used in Tasks 4, 5, 7. `applyActionBundle` signature `(boxes, bundle) => ActionBundle` used consistently in history tests and decorate tests. `AddResult { bundle, newId }` defined once (Task 7) and used by all add builders. `newBox`/`newBoxId`/`columnOf`/`descendants`/`indexInParent` (Task 2) match their call sites in Tasks 6–7.

**Note on the `delete` inverse test (Task 3):** the assertion uses `expect.any(Object)` for the restored `value`; this is intentional since the exact `Box` object identity is not the point — the round-trip test (`roundTrips`) is the real guarantee.
