/**
 * IMPORTANT: fake-indexeddb/auto MUST be imported first.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";

import { flowDb } from "./flowDb";
import {
    deleteFlowForever,
    listFlows,
    listFlowTrash,
    loadFlow,
    persistFlow,
    restoreFlow,
    softDeleteFlow,
} from "./flowPersistence";

describe("flow persistence", () => {
    it("persists, loads, and lists a round", async () => {
        const r = makeFlowRound("aff");
        await persistFlow(r);
        const loaded = await loadFlow(r.id);
        expect(loaded?.id).toBe(r.id);
        expect(loaded?.sheets.some((s) => s.kind === "cx")).toBe(true);
        expect((await listFlows()).map((s) => s.id)).toContain(r.id);
        await deleteFlowForever(r.id);
    });

    it("soft delete moves between live and trash lists; restore reverses", async () => {
        const r = makeFlowRound("neg");
        await persistFlow(r);
        await softDeleteFlow(r.id);
        expect((await listFlows()).map((s) => s.id)).not.toContain(r.id);
        expect((await listFlowTrash()).map((s) => s.id)).toContain(r.id);
        await restoreFlow(r.id);
        expect((await listFlows()).map((s) => s.id)).toContain(r.id);
        await deleteFlowForever(r.id);
        expect(await loadFlow(r.id)).toBeUndefined();
    });

    it("serves both lists from one table read until a write invalidates it", async () => {
        const r = makeFlowRound("aff");
        await persistFlow(r);
        const orderBy = vi.spyOn(flowDb.flows, "orderBy");

        await listFlows();
        await listFlowTrash();
        expect(orderBy).toHaveBeenCalledTimes(1);

        await softDeleteFlow(r.id);
        expect((await listFlowTrash()).map((s) => s.id)).toContain(r.id);
        expect(orderBy).toHaveBeenCalledTimes(2);

        orderBy.mockRestore();
        await deleteFlowForever(r.id);
    });
});
