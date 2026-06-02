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
