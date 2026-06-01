/**
 * db.ts — Dexie database schema + singleton.
 *
 * Keep this file focused: schema declaration only.
 * All persistence operations live in autosave.ts.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Round } from '@/lib/model/types';

class DebateFlowDB extends Dexie {
  rounds!: EntityTable<Round, 'id'>;

  constructor() {
    super('debateflow');
    this.version(1).stores({
      /**
       * Primary key:  id
       * Index:        updatedAt  (for sorting by recency)
       */
      rounds: 'id, updatedAt',
    });
  }
}

/**
 * Singleton instance.
 *
 * Dexie is safe to instantiate in non-browser environments — it only
 * touches indexedDB when you actually perform a query, not during
 * construction.  The Next.js static-export prerender does not import
 * this module directly, so no guard is needed.
 */
export const db = new DebateFlowDB();
