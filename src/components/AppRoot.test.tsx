/**
 * AppRoot integration tests.
 *
 * IMPORTANT: fake-indexeddb/auto MUST be imported first so it polyfills
 * the global indexedDB before Dexie is imported.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { db } from "@/lib/persistence/db";
import { persistRound } from "@/lib/persistence/autosave";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round, Format } from "@/lib/model/types";

// ─── Navigation mock ──────────────────────────────────────────────────────────

const replace = vi.fn();
let mockSearch = "";

// Stable router object — recreating it each render would change the useEffect
// dependency and cause the effect to re-run indefinitely in tests.
const stableRouter = { replace };

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

// Import AppRoot AFTER mock is set up
import AppRoot from "./AppRoot";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
  mockSearch = "";
  replace.mockReset();
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    selection: null,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AppRoot", () => {
  it("redirects to / when no ?id= param", async () => {
    mockSearch = "";
    render(<AppRoot />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });

  it("redirects to / when ?id= does not match any round", async () => {
    mockSearch = "id=nonexistent_id";
    render(<AppRoot />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });

  it("shows Workspace when ?id= matches a live round", async () => {
    const round = makeRound();
    await persistRound(round);
    mockSearch = `id=${round.id}`;

    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });
  });

  it("redirects to / when the round is trashed", async () => {
    const round = makeRound({ deletedAt: 1 });
    await persistRound(round);
    mockSearch = `id=${round.id}`;

    render(<AppRoot />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });
});
