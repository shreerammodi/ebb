/**
 * autosave.ts — persistence operations + debounced autosave wiring.
 *
 * Depends on db.ts for the Dexie singleton.
 */

import { db } from "./db";
import type { Round } from "@/lib/model/types";
import type { RoundStore } from "@/lib/store/useRoundStore";
import type { StoreApi } from "zustand";
import { normalizeRound } from "@/lib/model/normalize";
import { buildSummary, type RoundSummary } from "@/lib/dashboard/summary";
import { writeSearchIndex, deleteSearchIndex } from "./searchIndex";

export type { RoundSummary };

// ─── Core CRUD ────────────────────────────────────────────────────────────────

/** Persist (insert or update) a round and refresh its search index row. */
export async function persistRound(round: Round): Promise<void> {
  const normalized = normalizeRound(round);
  await db.rounds.put(normalized);
  await writeSearchIndex(normalized);
}

/** Load a single round by id. Returns undefined if not found. */
export async function loadRound(id: string): Promise<Round | undefined> {
  const r = await db.rounds.get(id);
  return r ? normalizeRound(r) : undefined;
}

/** Live (non-trashed) round summaries, most-recently-updated first. */
export async function listRounds(): Promise<RoundSummary[]> {
  const rounds = await db.rounds.orderBy("updatedAt").reverse().toArray();
  return rounds.filter((r) => r.deletedAt == null).map(buildSummary);
}

/** Trashed round summaries, most-recently-updated first. */
export async function listTrash(): Promise<RoundSummary[]> {
  const rounds = await db.rounds.orderBy("updatedAt").reverse().toArray();
  return rounds.filter((r) => r.deletedAt != null).map(buildSummary);
}

/** Move a round to Trash (soft delete). */
export async function softDeleteRound(id: string): Promise<void> {
  await db.rounds.update(id, { deletedAt: Date.now() });
}

/** Restore a trashed round. */
export async function restoreRound(id: string): Promise<void> {
  await db.rounds.update(id, { deletedAt: null });
}

/** Permanently delete a round and its search index row. */
export async function deleteRoundForever(id: string): Promise<void> {
  await db.rounds.delete(id);
  await deleteSearchIndex(id);
}

/** Most-recently-updated LIVE round, normalized; undefined if none. */
export async function loadLastRound(): Promise<Round | undefined> {
  const rounds = await db.rounds.orderBy("updatedAt").reverse().toArray();
  const live = rounds.find((r) => r.deletedAt == null);
  return live ? normalizeRound(live) : undefined;
}

// ─── attachAutosave ───────────────────────────────────────────────────────────

/** Debounce delay in milliseconds. */
const DEBOUNCE_MS = 400;

/**
 * Subscribe to a zustand store that holds RoundStore state.  Whenever
 * `state.round` exists and its `id` or `updatedAt` has changed since the
 * last save, schedule a debounced persist.
 *
 * Returns an unsubscribe function that also flushes any pending save
 * immediately before cancelling the subscription.
 */
export function attachAutosave(store: StoreApi<RoundStore>): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSeenId: string | null = null;
  let lastSeenUpdatedAt: number | null = null;
  let pendingRound: Round | null = null;

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingRound !== null) {
      const toSave = pendingRound;
      pendingRound = null;
      // Fire-and-forget; callers awaiting persistence should use
      // loadRound after the microtask queue drains.
      void persistRound(toSave);
    }
  }

  const unsubscribe = store.subscribe((state) => {
    const { round } = state;

    if (!round) return;

    const changed = round.id !== lastSeenId || round.updatedAt !== lastSeenUpdatedAt;

    if (!changed) return;

    // Record what we're about to save so we can detect redundant updates.
    lastSeenId = round.id;
    lastSeenUpdatedAt = round.updatedAt;
    pendingRound = round;

    // Reset debounce window.
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (pendingRound !== null) {
        const toSave = pendingRound;
        pendingRound = null;
        void persistRound(toSave);
      }
    }, DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    flush();
  };
}
