import type { Round, Scouting, Sheet } from './types';
import { uid } from './ids';

const emptyDebater = () => ({ first: '', last: '' });

export function emptyScouting(): Scouting {
  return {
    aff: { first: emptyDebater(), second: emptyDebater() },
    neg: { first: emptyDebater(), second: emptyDebater() },
  };
}

/** A fresh pinned CX sheet. order = -1 so it sorts above flow sheets. */
export function makeCxSheet(): Sheet {
  return { id: uid('sheet'), title: 'CX', group: 'aff', order: -1, kind: 'cx' };
}

/**
 * Normalize a round read from storage/import: fill in new fields, default
 * sheet kind, drop the legacy topic + cx, and ensure exactly one CX sheet exists.
 */
export function normalizeRound(raw: Round): Round {
  const r = { ...raw } as Round & { topic?: unknown; cx?: unknown };
  delete r.topic;
  delete r.cx;
  if (!r.scouting) r.scouting = emptyScouting();
  r.sheets = r.sheets.map(s => ({ ...s, kind: s.kind ?? 'flow' }));
  if (!r.sheets.some(s => s.kind === 'cx')) {
    r.sheets = [makeCxSheet(), ...r.sheets];
  }
  return r;
}
