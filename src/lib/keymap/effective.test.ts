import { describe, it, expect } from 'vitest';
import { effectiveKeymap } from './effective';
import { getPresetKeymap } from './presets';

describe('effectiveKeymap', () => {
  it('returns the preset bindings when there are no overrides', () => {
    const keymap = effectiveKeymap('vim', {});
    const preset = getPresetKeymap('vim');
    expect(keymap.bindings.normal).toEqual(preset.bindings.normal);
    expect(keymap.bindings.insert).toEqual(preset.bindings.insert);
  });

  it('applies an override and removes the old preset chord for that command', () => {
    const keymap = effectiveKeymap('vim', { 'move.down': 'g' });
    expect(keymap.bindings.normal['g']).toBe('move.down');
    // vim's original "j" → move.down is gone.
    expect(keymap.bindings.normal['j']).toBeUndefined();
  });

  it('leaves other bindings untouched', () => {
    const keymap = effectiveKeymap('vim', { 'move.down': 'g' });
    expect(keymap.bindings.normal['k']).toBe('move.up');
    expect(keymap.bindings.normal['h']).toBe('move.left');
  });

  it('ignores empty override chords', () => {
    const keymap = effectiveKeymap('vim', { 'move.down': '' });
    expect(keymap.bindings.normal['j']).toBe('move.down');
  });

  it('names the keymap to indicate overrides are applied', () => {
    expect(effectiveKeymap('excel', {}).name).toBe('excel+overrides');
  });
});
