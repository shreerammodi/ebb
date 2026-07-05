/**
 * The flows database. A Dexie database ("ebbflow") separate from the
 * legacy "debateflow" store, which new code never opens; legacy rounds stay
 * on disk but are inaccessible from the app.
 */

import Dexie, { type EntityTable } from "dexie";

import type { FlowRound } from "@/lib/model/flow";

class EbbFlowDB extends Dexie {
    flows!: EntityTable<FlowRound, "id">;

    constructor() {
        super("ebbflow");
        this.version(1).stores({
            flows: "id, updatedAt, deletedAt",
        });
    }
}

export const flowDb = new EbbFlowDB();
