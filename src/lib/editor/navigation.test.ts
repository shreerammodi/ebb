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
