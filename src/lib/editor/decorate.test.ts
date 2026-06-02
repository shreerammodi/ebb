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
