import Dexie, { type EntityTable } from "dexie";

import type { SpikeMeta } from "@/app/hot/SpikeGrid";

export interface SpikeDoc {
    id: "spike";
    data: (string | null)[][];
    meta: SpikeMeta;
    savedAt: number;
}

/** Isolated from the app database; deleted with the spike. */
class SpikeDB extends Dexie {
    flows!: EntityTable<SpikeDoc, "id">;

    constructor() {
        super("ebb-spike");
        this.version(1).stores({ flows: "id" });
    }
}

const db = new SpikeDB();

export async function saveSpike(doc: SpikeDoc): Promise<void> {
    await db.flows.put(doc);
}

export async function loadSpike(): Promise<SpikeDoc | undefined> {
    return db.flows.get("spike");
}
