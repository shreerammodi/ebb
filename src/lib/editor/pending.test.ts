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
