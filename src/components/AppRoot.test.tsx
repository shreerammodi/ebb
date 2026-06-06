/**
 * AppRoot integration tests.
 *
 * IMPORTANT: fake-indexeddb/auto MUST be imported first so it polyfills
 * the global indexedDB before Dexie is imported.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { db } from "@/lib/persistence/db";
import { persistRound } from "@/lib/persistence/autosave";
import { emptyScouting } from "@/lib/model/normalize";
import AppRoot from "./AppRoot";
import type { Round, Format } from "@/lib/model/types";

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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.rounds.clear();
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: "normal",
    selection: null,
    quickSwitcherOpen: false,
    settingsOpen: false,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AppRoot", () => {
  it("shows RoundSetup when no round is stored", async () => {
    render(<AppRoot />);

    // Wait for the async loadLastRound to finish (loaded = true)
    await waitFor(() => {
      expect(screen.getByTestId("round-setup-form")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
  });

  it("shows Workspace when a round is stored in IndexedDB", async () => {
    const round = makeRound();
    await persistRound(round);

    render(<AppRoot />);

    // AppRoot loads the round from IndexedDB and renders Workspace
    await waitFor(() => {
      expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("round-setup-form")).not.toBeInTheDocument();
  });

  it("shows Workspace after createRound is called in the store", async () => {
    render(<AppRoot />);

    // Initially shows RoundSetup (no stored round)
    await waitFor(() => {
      expect(screen.getByTestId("round-setup-form")).toBeInTheDocument();
    });

    // Simulate a round being created (as RoundSetup would do)
    useRoundStore.getState().createRound({
      role: "aff",
      format: FORMAT,
    });

    await waitFor(() => {
      expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });
  });

  it('returns to RoundSetup when "New round" is clicked in the header', async () => {
    const round = makeRound();
    await persistRound(round);

    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });

    // Click "New round" button in RoundHeader
    const newRoundBtn = screen.getByTestId("new-round-btn");
    await userEvent.click(newRoundBtn);

    await waitFor(() => {
      expect(screen.getByTestId("round-setup-form")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
  });
});
