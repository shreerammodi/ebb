/**
 * autosave.test.ts
 *
 * IMPORTANT: fake-indexeddb/auto MUST be imported first so it polyfills
 * the global indexedDB before Dexie is imported.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  persistRound,
  loadRound,
  listRounds,
  deleteRound,
  loadLastRound,
  attachAutosave,
} from "./autosave";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round, Format } from "@/lib/model/types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Minimal format fixture. */
const FORMAT: Format = {
  id: "fmt_test",
  name: "Test Format",
  speeches: [],
  prepSeconds: { aff: 240, neg: 240 },
};

function makeRound(overrides: Partial<Round> = {}): Round {
  const now = Date.now();
  return {
    id: `round_test_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
    role: "aff",
    format: FORMAT,
    scouting: emptyScouting(),
    sheets: [],
    nodes: [],
    groups: [],
    timers: {
      activeSpeechId: null,
      speechRemaining: null,
      running: false,
      prepRemaining: { aff: 240, neg: 240 },
      prepRunning: null,
    },
    ...overrides,
  };
}

/** Reset the zustand store between tests. */
function resetStore() {
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: "normal",
    selection: null,
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.rounds.clear();
  resetStore();
  vi.useRealTimers();
});

// ─── persistRound / loadRound ─────────────────────────────────────────────────

describe("persistRound + loadRound", () => {
  it("round stored then loaded is deep-equal to original", async () => {
    const round = makeRound();
    await persistRound(round);
    const loaded = await loadRound(round.id);
    expect(loaded).toEqual(round);
  });

  it("loadRound returns undefined for non-existent id", async () => {
    const result = await loadRound("nonexistent_id");
    expect(result).toBeUndefined();
  });
});

// ─── listRounds ───────────────────────────────────────────────────────────────

describe("listRounds", () => {
  it("returns summaries sorted by updatedAt DESC (most recent first)", async () => {
    const older = makeRound({ updatedAt: 1000, createdAt: 1000 });
    const newer = makeRound({ updatedAt: 2000, createdAt: 1500 });
    await persistRound(older);
    await persistRound(newer);

    const summaries = await listRounds();
    expect(summaries.length).toBe(2);
    expect(summaries[0].updatedAt).toBe(2000);
    expect(summaries[1].updatedAt).toBe(1000);
  });

  it("summary contains required fields: id, updatedAt, createdAt, role", async () => {
    const round = makeRound({ role: "neg" });
    await persistRound(round);

    const summaries = await listRounds();
    const s = summaries[0];
    expect(s.id).toBe(round.id);
    expect(s.updatedAt).toBe(round.updatedAt);
    expect(s.createdAt).toBe(round.createdAt);
    expect(s.role).toBe("neg");
  });

  it("returns empty array when no rounds", async () => {
    const summaries = await listRounds();
    expect(summaries).toEqual([]);
  });
});

// ─── deleteRound ──────────────────────────────────────────────────────────────

describe("deleteRound", () => {
  it("deleted round is no longer retrievable via loadRound", async () => {
    const round = makeRound();
    await persistRound(round);
    await deleteRound(round.id);
    const loaded = await loadRound(round.id);
    expect(loaded).toBeUndefined();
  });

  it("does not affect other rounds", async () => {
    const a = makeRound();
    const b = makeRound();
    await persistRound(a);
    await persistRound(b);
    await deleteRound(a.id);
    const loadedB = await loadRound(b.id);
    expect(loadedB).toEqual(b);
  });
});

// ─── loadLastRound ────────────────────────────────────────────────────────────

describe("loadLastRound", () => {
  it("returns undefined when no rounds exist", async () => {
    const result = await loadLastRound();
    expect(result).toBeUndefined();
  });

  it("returns the round with the highest updatedAt", async () => {
    const older = makeRound({ updatedAt: 1000 });
    const newer = makeRound({ updatedAt: 3000 });
    const middle = makeRound({ updatedAt: 2000 });
    await persistRound(older);
    await persistRound(newer);
    await persistRound(middle);

    const last = await loadLastRound();
    expect(last?.id).toBe(newer.id);
  });
});

// ─── attachAutosave ───────────────────────────────────────────────────────────

describe("attachAutosave", () => {
  it("persists round after debounce fires following store mutation", async () => {
    // Only fake setTimeout/clearTimeout — leave Promise/microtask machinery real
    // so Dexie's IndexedDB operations can still resolve.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const unsubscribe = attachAutosave(useRoundStore);

    // Create a round in the store
    useRoundStore.getState().createRound({
      role: "aff",
      format: FORMAT,
    });
    const round = useRoundStore.getState().round!;
    expect(round).not.toBeNull();

    // Trigger a mutation
    useRoundStore.getState().addSheet({ title: "Case", group: "aff" });

    // Advance timers past the debounce window (400ms)
    vi.advanceTimersByTime(500);

    // Drain microtasks so the persisted promise resolves
    await Promise.resolve();
    await Promise.resolve();

    const persisted = await loadRound(round.id);
    // The persisted round should have the same base id
    expect(persisted?.id).toBe(round.id);

    unsubscribe();
    vi.useRealTimers();
  });

  it("unsubscribe flushes a pending save immediately", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const unsubscribe = attachAutosave(useRoundStore);

    useRoundStore.getState().createRound({
      role: "neg",
      format: FORMAT,
    });
    const round = useRoundStore.getState().round!;

    // Mutate but do NOT advance timers — pending save in buffer
    useRoundStore.getState().addSheet({ title: "Offcase", group: "neg" });

    // Unsubscribe should flush the pending save immediately (no timer advance needed)
    unsubscribe();

    // Drain microtasks so the fire-and-forget persistRound resolves
    await Promise.resolve();
    await Promise.resolve();

    const persisted = await loadRound(round.id);
    expect(persisted?.id).toBe(round.id);

    vi.useRealTimers();
  });

  it("does not save when round is null", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const unsubscribe = attachAutosave(useRoundStore);

    // No round set — store has round: null
    expect(useRoundStore.getState().round).toBeNull();

    // Trigger an unrelated store change
    useRoundStore.setState({ mode: "insert" });

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    const summaries = await listRounds();
    expect(summaries).toHaveLength(0);

    unsubscribe();
    vi.useRealTimers();
  });

  it("does not write a duplicate save if round has not changed since last save", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const unsubscribe = attachAutosave(useRoundStore);

    useRoundStore.getState().createRound({
      role: "aff",
      format: FORMAT,
    });

    // First mutation + flush
    useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    const firstPersistedCount = (await listRounds()).length;
    expect(firstPersistedCount).toBe(1);

    // No further mutation — trigger an unrelated state update that doesn't change round
    useRoundStore.setState({ mode: "insert" });
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    // Still only one round record
    const count = (await listRounds()).length;
    expect(count).toBe(firstPersistedCount);

    unsubscribe();
    vi.useRealTimers();
  });
});
