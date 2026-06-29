/**
 * IMPORTANT: fake-indexeddb/auto MUST be imported first.
 */
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, it, expect } from "vitest";

import { DebateFlowDB } from "./db";

describe("IndexedDB v1→v2 migration", () => {
    it("remaps case→aff and offcase→neg on all sheet groups", async () => {
        const DB_NAME = "debateflow-migration-test";

        // Seed a v1 database with old group values.
        const v1 = new Dexie(DB_NAME);
        v1.version(1).stores({ rounds: "id, updatedAt" });
        await v1.table("rounds").add({
            id: "round_mig",
            createdAt: 1,
            updatedAt: 1,
            role: "aff",
            format: {
                id: "f",
                name: "T",
                speeches: [],
                prepSeconds: { aff: 240, neg: 240 },
            },
            nodes: [],
            sheets: [
                { id: "sh1", title: "Case", group: "case", order: 0 },
                { id: "sh2", title: "DA", group: "offcase", order: 1 },
            ],
        });
        await v1.close();

        // Open using the production DebateFlowDB class so the actual upgrade runs.
        const v2 = new DebateFlowDB(DB_NAME);
        const migrated = await v2.rounds.get("round_mig");
        expect(migrated!.sheets).toHaveLength(2);
        expect(migrated!.sheets[0].group).toBe("aff");
        expect(migrated!.sheets[1].group).toBe("neg");
        await v2.close();
    });
});

describe("IndexedDB v4 migration", () => {
    it("v4 collapses newlines in node text to single lines", async () => {
        const DB_NAME = "debateflow-v4-newline-test";

        // Seed a v1 database carrying nodes with multi-line text.
        const v1 = new Dexie(DB_NAME);
        v1.version(1).stores({ rounds: "id, updatedAt" });
        await v1.table("rounds").add({
            id: "round_v4",
            createdAt: 1,
            updatedAt: 1,
            role: "aff",
            format: {
                id: "f",
                name: "T",
                speeches: [],
                prepSeconds: { aff: 240, neg: 240 },
            },
            nodes: [
                {
                    id: "n1",
                    sheetId: "s",
                    speechId: "1ac",
                    parentId: null,
                    order: 0,
                    text: "tag\ncite",
                    statuses: [],
                    bold: false,
                    highlight: false,
                    numberOverride: null,
                },
            ],
            sheets: [],
        });
        await v1.close();

        // Open with the production class so all upgrades (incl. v4) run.
        const upgraded = new DebateFlowDB(DB_NAME);
        const r = await upgraded.rounds.get("round_v4");
        expect(r!.nodes[0].text).toBe("tag cite");
        await upgraded.close();
    });
});

describe("IndexedDB v5 schema", () => {
    it("exposes a searchIndex table and keeps rounds", async () => {
        const DB_NAME = "debateflow-v5-schema-test";
        const db = new DebateFlowDB(DB_NAME);
        await db.searchIndex.put({ id: "r1", searchText: "hello world" });
        const row = await db.searchIndex.get("r1");
        expect(row?.searchText).toBe("hello world");
        expect(db.rounds).toBeDefined();
        await db.close();
    });
});
