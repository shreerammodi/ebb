import type { Round, Scouting, CxData, Sheet } from './types';
import { uid } from './ids';

const emptyDebater = () => ({ first: '', last: '' });

export function emptyScouting(): Scouting {
  return {
    aff: { first: emptyDebater(), second: emptyDebater() },
    neg: { first: emptyDebater(), second: emptyDebater() },
  };
}

export function emptyCx(): CxData {
  return { '1AC': [], '1NC': [], '2AC': [], '2NC': [] };
}

/** A fresh pinned CX sheet. order = -1 so it sorts above flow sheets. */
export function makeCxSheet(): Sheet {
  return { id: uid('sheet'), title: 'CX', group: 'aff', order: -1, kind: 'cx' };
}

/**
 * Normalize a round read from storage/import: fill in new fields, default
 * sheet kind, drop the legacy topic, and ensure exactly one CX sheet exists.
 */
export function normalizeRound(raw: Round): Round {
  const r = { ...raw } as Round & { topic?: unknown };
  delete r.topic;
  if (!r.scouting) r.scouting = emptyScouting();
  if (!r.cx) r.cx = emptyCx();
  r.sheets = r.sheets.map(s => ({ ...s, kind: s.kind ?? 'flow' }));
  if (!r.sheets.some(s => s.kind === 'cx')) {
    r.sheets = [makeCxSheet(), ...r.sheets];
  }
  return r;
}
