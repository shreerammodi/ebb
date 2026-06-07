import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import ImportExportControls from "./ImportExportControls";
import { listRounds } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: emptyScouting(), sheets: [{ id: "s", title: "Aff", group: "aff", order: 0, kind: "flow" }], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("ImportExportControls", () => {
  it("imports a single-flow file as a new flow", async () => {
    const onChanged = vi.fn();
    render(<ImportExportControls onChanged={onChanged} />);
    const file = new File(
      [JSON.stringify({ version: 2, round: mk("orig") })],
      "flow.json",
      { type: "application/json" },
    );
    await userEvent.upload(screen.getByTestId("import-input"), file);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const live = await listRounds();
    expect(live.length).toBe(1);
    expect(live[0].id).not.toBe("orig");
  });

  it("imports a backup file with multiple flows", async () => {
    const onChanged = vi.fn();
    render(<ImportExportControls onChanged={onChanged} />);
    const file = new File(
      [JSON.stringify({ version: 2, kind: "backup", rounds: [mk("a"), mk("b")] })],
      "backup.json",
      { type: "application/json" },
    );
    await userEvent.upload(screen.getByTestId("import-input"), file);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await listRounds()).length).toBe(2);
  });
});
