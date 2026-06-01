/**
 * autosave.ts — persistence operations + debounced autosave wiring.
 *
 * Depends on db.ts for the Dexie singleton.
 */

import { db } from './db';
import type { Round } from '@/lib/model/types';
import type { RoundStore } from '@/lib/store/useRoundStore';
import type { StoreApi } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Lightweight summary returned by listRounds(). */
export interface RoundSummary {
  id: string;
  updatedAt: number;
  createdAt: number;
  topic?: string;
  role: Round['role'];
  meta: Round['meta'];
}

// ─── Core CRUD ────────────────────────────────────────────────────────────────

/** Persist (insert or update) a round in IndexedDB. */
export async function persistRound(round: Round): Promise<void> {
  await db.rounds.put(round);
}

/** Load a single round by id.  Returns undefined if not found. */
export async function loadRound(id: string): Promise<Round | undefined> {
  return db.rounds.get(id);
}

/**
 * Return lightweight summaries of all rounds, sorted by updatedAt DESC
 * (most recently updated first).
 */
export async function listRounds(): Promise<RoundSummary[]> {
  const rounds = await db.rounds.orderBy('updatedAt').reverse().toArray();
  return rounds.map(r => ({
    id: r.id,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    topic: r.topic,
    role: r.role,
    meta: r.meta,
  }));
}

/** Delete a round by id. */
export async function deleteRound(id: string): Promise<void> {
  await db.rounds.delete(id);
}

/**
 * Return the most-recently-updated round, or undefined if the database is
 * empty.
 */
export async function loadLastRound(): Promise<Round | undefined> {
  return db.rounds.orderBy('updatedAt').last();
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

    const changed =
      round.id !== lastSeenId || round.updatedAt !== lastSeenUpdatedAt;

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
