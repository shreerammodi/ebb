/**
 * db.ts — Dexie database schema + singleton.
 *
 * Keep this file focused: schema declaration only.
 * All persistence operations live in autosave.ts.
 */

import Dexie, { type EntityTable } from "dexie";
import type { Round } from "@/lib/model/types";
import {
    assignRowsFromLegacyTree,
    type LegacyRound,
} from "@/lib/grid/migrateRows";

/** A precomputed fuzzy-search haystack for one round (scouting + all node text). */
export interface SearchIndexRow {
    id: string;
    searchText: string;
}

export class DebateFlowDB extends Dexie {
    rounds!: EntityTable<Round, "id">;
    searchIndex!: EntityTable<SearchIndexRow, "id">;

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
                        group:
                            s.group === "case"
                                ? "aff"
                                : s.group === "offcase"
                                  ? "neg"
                                  : s.group,
                    }));
                }),
        );
        this.version(3).upgrade((tx) =>
            tx
                .table("rounds")
                .toCollection()
                .modify((r: { nodes?: Array<{ bold?: boolean }> }) => {
                    if (Array.isArray(r.nodes)) {
                        r.nodes = r.nodes.map((n) => ({
                            ...n,
                            bold: n.bold ?? false,
                        }));
                    }
                }),
        );
        this.version(4).upgrade((tx) =>
            tx
                .table("rounds")
                .toCollection()
                .modify((r: { nodes?: Array<{ text?: string }> }) => {
                    if (Array.isArray(r.nodes)) {
                        r.nodes = r.nodes.map((n) => ({
                            ...n,
                            text:
                                typeof n.text === "string"
                                    ? n.text.replace(/\r?\n|\r/g, " ")
                                    : n.text,
                        }));
                    }
                }),
        );
        this.version(5).stores({
            // Re-declare rounds to add the deletedAt index; add the searchIndex table.
            rounds: "id, updatedAt, deletedAt",
            searchIndex: "id",
        });
        // Grid-owns-position migration: assign each node a `row` coordinate from
        // the legacy parentId+order tree (and drop `order`).
        this.version(6).upgrade((tx) =>
            tx
                .table("rounds")
                .toCollection()
                .modify((r: LegacyRound) => {
                    if (!Array.isArray(r.nodes) || !Array.isArray(r.sheets))
                        return;
                    assignRowsFromLegacyTree(r);
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
