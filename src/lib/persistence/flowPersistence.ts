/**
 * CRUD and autosave for FlowRounds against the ebbflow database.
 */

import type { StoreApi } from "zustand";

import { buildSummary, type RoundSummary } from "@/lib/dashboard/summary";
import { normalizeFlow, type FlowRound } from "@/lib/model/flow";

import { flowDb } from "./flowDb";

export type { RoundSummary };

export async function persistFlow(round: FlowRound): Promise<void> {
    await flowDb.flows.put(normalizeFlow(round));
    invalidateFlowSummaries();
}

export async function loadFlow(id: string): Promise<FlowRound | undefined> {
    const r = await flowDb.flows.get(id);
    return r ? normalizeFlow(r) : undefined;
}

// --- Summary cache -----------------------------------------------------------

/**
 * IndexedDB hands back whole rounds - every sheet, every cell - and the two
 * list views need only the scouting header off each. One memoized scan serves
 * both, so returning to the dashboard, or refreshing it after a rename, never
 * re-deserializes the library. Caching the promise rather than its value also
 * coalesces concurrent callers into a single read.
 *
 * ponytail: warm path only; the first scan of a session still reads every
 * round whole. Denormalize summaries into their own table if a large library
 * opens slowly.
 */
let scan: Promise<{ summary: RoundSummary; deleted: boolean }[]> | null = null;

function scanSummaries() {
    scan ??= flowDb.flows
        .orderBy("updatedAt")
        .reverse()
        .toArray()
        .then((rounds) =>
            rounds.map((r) => ({ summary: buildSummary(r), deleted: r.deletedAt != null })),
        )
        .catch((err) => {
            scan = null;
            throw err;
        });
    return scan;
}

/** Every write to the flows table must call this or the lists serve stale cards. */
export function invalidateFlowSummaries(): void {
    scan = null;
}

/** Live (non-trashed) round summaries, most-recently-updated first. */
export async function listFlows(): Promise<RoundSummary[]> {
    return (await scanSummaries()).filter((r) => !r.deleted).map((r) => r.summary);
}

/** Trashed round summaries, most-recently-updated first. */
export async function listFlowTrash(): Promise<RoundSummary[]> {
    return (await scanSummaries()).filter((r) => r.deleted).map((r) => r.summary);
}

/** Move a round to Trash (soft delete). */
export async function softDeleteFlow(id: string): Promise<void> {
    await flowDb.flows.update(id, { deletedAt: Date.now() });
    invalidateFlowSummaries();
}

/** Restore a trashed round. */
export async function restoreFlow(id: string): Promise<void> {
    await flowDb.flows.update(id, { deletedAt: null });
    invalidateFlowSummaries();
}

/** Permanently delete a round. */
export async function deleteFlowForever(id: string): Promise<void> {
    await flowDb.flows.delete(id);
    invalidateFlowSummaries();
}

// --- Autosave ----------------------------------------------------------------

const DEBOUNCE_MS = 500;

/**
 * Lifecycle of a single persist, reported to an optional status listener so
 * the UI can reassure the user their round is safe.
 */
export type SaveStatus = "saving" | "saved" | "error";

/**
 * Persist a round immediately, reporting "saving" then "saved"/"error".
 * Used by manual retry affordances when an autosave has failed.
 */
export async function saveFlowNow(
    round: FlowRound,
    onStatus?: (status: SaveStatus) => void,
): Promise<void> {
    onStatus?.("saving");
    try {
        await persistFlow(round);
        onStatus?.("saved");
    } catch {
        onStatus?.("error");
    }
}

/**
 * Subscribe to a store holding { round } and persist on id/updatedAt change,
 * debounced. Only the latest save reports a terminal status, so a slow
 * earlier save cannot clobber a newer one. The returned unsubscribe flushes
 * any pending save first.
 */
export function attachFlowAutosave(
    store: StoreApi<{ round: FlowRound | null }>,
    onStatus?: (status: SaveStatus) => void,
): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSeenId: string | null = null;
    let lastSeenUpdatedAt: number | null = null;
    let pending: FlowRound | null = null;
    let saveSeq = 0;

    function doSave(toSave: FlowRound) {
        const seq = ++saveSeq;
        onStatus?.("saving");
        persistFlow(toSave).then(
            () => {
                if (seq === saveSeq) onStatus?.("saved");
            },
            () => {
                if (seq === saveSeq) onStatus?.("error");
            },
        );
    }

    function flush() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (pending !== null) {
            const toSave = pending;
            pending = null;
            doSave(toSave);
        }
    }

    const unsubscribe = store.subscribe((state) => {
        const { round } = state;
        if (!round) return;
        if (round.id === lastSeenId && round.updatedAt === lastSeenUpdatedAt) return;
        lastSeenId = round.id;
        lastSeenUpdatedAt = round.updatedAt;
        pending = round;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (pending !== null) {
                const toSave = pending;
                pending = null;
                doSave(toSave);
            }
        }, DEBOUNCE_MS);
    });

    return () => {
        unsubscribe();
        flush();
    };
}
