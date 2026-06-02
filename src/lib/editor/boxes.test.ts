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
