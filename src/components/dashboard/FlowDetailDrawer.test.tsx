import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import FlowDetailDrawer from "./FlowDetailDrawer";
import { persistRound } from "@/lib/persistence/autosave";
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
    scouting: {
      ...emptyScouting(),
      affSchool: "Westwood",
      tournament: "Berkeley",
      judge: "K. Strange",
      decision: { vote: "aff", rfd: "clear" },
    },
    sheets: [{ id: "s", title: "Aff", group: "aff", order: 0, kind: "flow" }],
    nodes: [],
    groups: [],
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("FlowDetailDrawer", () => {
  it("renders full scouting for the open id", async () => {
    await persistRound(mk("a"));
    render(<FlowDetailDrawer id="a" onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("Berkeley")).toBeInTheDocument());
    expect(screen.getByText("K. Strange")).toBeInTheDocument();
    expect(screen.getByText(/clear/)).toBeInTheDocument();
  });
});
