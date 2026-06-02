/**
 * IMPORTANT: fake-indexeddb/auto MUST be imported first.
 */
import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';

describe('IndexedDB v1→v2 migration', () => {
  it('remaps case→aff and offcase→neg on all sheet groups', async () => {
    const DB_NAME = 'debateflow-migration-test';

    // Seed a v1 database with old group values.
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores({ rounds: 'id, updatedAt' });
    await v1.table('rounds').add({
      id: 'round_mig',
      createdAt: 1,
      updatedAt: 1,
      role: 'aff',
      format: { id: 'f', name: 'T', speeches: [], prepSeconds: { aff: 240, neg: 240 } },
      meta: {},
      nodes: [],
      timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
      sheets: [
        { id: 'sh1', title: 'Case', group: 'case', order: 0 },
        { id: 'sh2', title: 'DA', group: 'offcase', order: 1 },
      ],
    });
    await v1.close();

    // Open at v2 with the same upgrade logic used in db.ts.
    const v2 = new Dexie(DB_NAME);
    v2.version(1).stores({ rounds: 'id, updatedAt' });
    v2.version(2).upgrade(tx =>
      tx.table('rounds').toCollection().modify((r: { sheets: Array<{ group: string }> }) => {
        r.sheets = r.sheets.map(s => ({
          ...s,
          group: s.group === 'case' ? 'aff' : s.group === 'offcase' ? 'neg' : s.group,
        }));
      }),
    );

    const migrated = await v2.table('rounds').get('round_mig') as { sheets: Array<{ group: string }> };
    expect(migrated.sheets[0].group).toBe('aff');
    expect(migrated.sheets[1].group).toBe('neg');
    await v2.close();
  });
});
