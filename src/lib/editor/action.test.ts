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
    expect(inv).toEqual({ tag: 'add', parentId: 'root', id: 'a', index: 0, value: expect.any(Object), children: ['a1'] });
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
