import { describe, it, expect } from 'vitest';
import { CX_COLUMNS, CX_COLUMN_IDS, responseColumnFor, columnsForSheet } from './cxColumns';
import type { Round } from './types';
import { makeFormatByKey } from '@/lib/format/presets';

describe('CX_COLUMNS', () => {
  it('has 8 columns: a Question + Response per period', () => {
    expect(CX_COLUMNS).toHaveLength(8);
    expect(CX_COLUMNS.filter(c => c.name === 'Question')).toHaveLength(4);
    expect(CX_COLUMNS.filter(c => c.name === 'Response')).toHaveLength(4);
  });
  it('groups each Q/R pair under the period label', () => {
    expect(CX_COLUMNS[0].group).toBe('1AC CX');
    expect(CX_COLUMNS[1].group).toBe('1AC CX');
    expect(CX_COLUMNS[6].group).toBe('2NC CX');
  });
  it('CX_COLUMN_IDS contains every column id', () => {
    expect(CX_COLUMN_IDS.has('cx-1ac-q')).toBe(true);
    expect(CX_COLUMN_IDS.size).toBe(8);
  });
});

describe('responseColumnFor', () => {
  it('maps a Question column to its paired Response column', () => {
    expect(responseColumnFor('cx-1ac-q')).toBe('cx-1ac-r');
    expect(responseColumnFor('cx-2nc-q')).toBe('cx-2nc-r');
  });
  it('returns null for a Response column or unknown id', () => {
    expect(responseColumnFor('cx-1ac-r')).toBeNull();
    expect(responseColumnFor('nope')).toBeNull();
  });
});

describe('columnsForSheet', () => {
  function round(): Round {
    return {
      id: 'r', createdAt: 0, updatedAt: 0, role: 'aff',
      format: makeFormatByKey('policy'), meta: {},
      scouting: { aff: { first: { first: '', last: '' }, second: { first: '', last: '' } }, neg: { first: { first: '', last: '' }, second: { first: '', last: '' } } },
      sheets: [
        { id: 'cx1', title: 'CX', group: 'aff', order: -1, kind: 'cx' },
        { id: 'f1', title: 'Aff', group: 'aff', order: 0, kind: 'flow' },
      ],
      nodes: [],
      cx: {} as any,
      timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
    } as Round;
  }
  it('returns CX columns for a cx sheet', () => {
    expect(columnsForSheet(round(), 'cx1')).toBe(CX_COLUMNS);
  });
  it('returns format speeches for a flow sheet', () => {
    const r = round();
    expect(columnsForSheet(r, 'f1')).toBe(r.format.speeches);
  });
});
