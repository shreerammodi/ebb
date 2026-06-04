/**
 * db.ts — Dexie database schema + singleton.
 *
 * Keep this file focused: schema declaration only.
 * All persistence operations live in autosave.ts.
 */

import Dexie, { type EntityTable } from "dexie";
import type { Round } from "@/lib/model/types";

export class DebateFlowDB extends Dexie {
  rounds!: EntityTable<Round, "id">;

  constructor(name = "debateflow") {
    super(name);
    this.version(1).stores({
      /**
       * Primary key:  id
       * Index:        updatedAt  (for sorting by recency)
       */
      rounds: "id, updatedAt",
    });
    this.version(2).upgrade((tx) =>
      tx
        .table("rounds")
        .toCollection()
        .modify((r: { sheets: Array<{ group: string }> }) => {
          r.sheets = r.sheets.map((s) => ({
            ...s,
            group: s.group === "case" ? "aff" : s.group === "offcase" ? "neg" : s.group,
          }));
        }),
    );
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
