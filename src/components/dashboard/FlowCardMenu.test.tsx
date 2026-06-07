import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

import FlowCardMenu from "./FlowCardMenu";
import { persistRound, listTrash, listRounds } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: emptyScouting(), sheets: [], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("FlowCardMenu", () => {
  it("soft-deletes the flow and calls onChanged", async () => {
    await persistRound(mk("a"));
    const onChanged = vi.fn();
    render(<FlowCardMenu id="a" onViewDetails={() => {}} onChanged={onChanged} />);
    await userEvent.click(screen.getByTestId("kebab-a"));
    await userEvent.click(await screen.findByTestId("kebab-delete-a"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await listRounds()).length).toBe(0);
    expect((await listTrash()).map((s) => s.id)).toEqual(["a"]);
  });
});
