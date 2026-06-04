import { describe, it, expect } from 'vitest';
import { normalizeRound, emptyScouting } from './normalize';
import type { Round } from './types';

function legacy(): any {
  return {
    id: 'r1', createdAt: 1, updatedAt: 1, role: 'aff',
    format: { id: 'f', name: 'Policy', speeches: [], prepSeconds: { aff: 0, neg: 0 } },
    meta: {}, sheets: [{ id: 's1', title: 'Aff', group: 'aff', order: 0 }],
    nodes: [], timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
    topic: 'old topic',
  };
}

describe('normalizeRound', () => {
  it('adds scouting and a pinned CX sheet when missing', () => {
    const r = normalizeRound(legacy()) as Round;
    expect(r.scouting).toEqual(emptyScouting());
    expect(r.sheets.some(s => s.kind === 'cx')).toBe(true);
  });
  it('defaults existing sheets to kind "flow"', () => {
    const r = normalizeRound(legacy()) as Round;
    expect(r.sheets.find(s => s.id === 's1')!.kind).toBe('flow');
  });
  it('drops the legacy topic field', () => {
    const r = normalizeRound(legacy()) as any;
    expect(r.topic).toBeUndefined();
  });
  it('does not add a second CX sheet if one exists', () => {
    const base = legacy();
    base.sheets.push({ id: 'cx1', title: 'CX', group: 'aff', order: 1, kind: 'cx' });
    const r = normalizeRound(base) as Round;
    expect(r.sheets.filter(s => s.kind === 'cx').length).toBe(1);
  });
});
