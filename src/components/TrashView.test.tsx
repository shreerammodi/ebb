import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));

import TrashView from "./TrashView";
import { persistRound, softDeleteRound, listRounds, listTrash } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: {
      id: "f",
      name: "Policy",
      speeches: [],
      prepSeconds: { aff: 240, neg: 240 },
    },
    scouting: { ...emptyScouting(), affSchool: id },
    sheets: [],
    nodes: [],
    groups: [],
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("TrashView", () => {
  it("restores a trashed flow", async () => {
    await persistRound(mk("a"));
    await softDeleteRound("a");
    render(<TrashView />);
    await waitFor(() => screen.getByTestId("trash-restore-a"));
    await userEvent.click(screen.getByTestId("trash-restore-a"));
    await waitFor(async () => expect((await listRounds()).map((s) => s.id)).toEqual(["a"]));
  });

  it("permanently deletes a flow after confirming in the dialog", async () => {
    await persistRound(mk("a"));
    await softDeleteRound("a");
    render(<TrashView />);
    await waitFor(() => screen.getByTestId("trash-delete-a"));
    await userEvent.click(screen.getByTestId("trash-delete-a"));
    // A confirm dialog appears; deletion only happens on accept.
    const accept = await screen.findByTestId("confirm-accept");
    await userEvent.click(accept);
    await waitFor(async () => expect(await db.rounds.get("a")).toBeUndefined());
  });

  it("does not delete when the confirm dialog is cancelled", async () => {
    await persistRound(mk("a"));
    await softDeleteRound("a");
    render(<TrashView />);
    await waitFor(() => screen.getByTestId("trash-delete-a"));
    await userEvent.click(screen.getByTestId("trash-delete-a"));
    await userEvent.click(await screen.findByTestId("confirm-cancel"));
    // Still present — cancel is safe.
    expect(await db.rounds.get("a")).toBeDefined();
  });
});
