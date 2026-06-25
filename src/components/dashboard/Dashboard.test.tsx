import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import Dashboard from "./Dashboard";
import { persistRound, softDeleteRound } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string, over: Partial<Round> = {}): Round {
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
            affSchool: id === "a" ? "Westwood" : "Mission",
            tournament: "Berkeley",
        },
        sheets: [],
        nodes: [],
        groups: [],
        ...over,
    };
}

beforeEach(async () => {
    await db.rounds.clear();
    await db.searchIndex.clear();
    push.mockReset();
});

describe("Dashboard", () => {
    it("lists live flows and excludes trashed", async () => {
        await persistRound(mk("a", { updatedAt: 5 }));
        await persistRound(mk("b", { updatedAt: 2, deletedAt: 1 }));
        render(<Dashboard />);
        await waitFor(() =>
            expect(screen.getByText("Westwood")).toBeInTheDocument(),
        );
        expect(screen.queryByText("Mission")).not.toBeInTheDocument();
    });

    it("navigates to the editor on card click", async () => {
        await persistRound(mk("a"));
        render(<Dashboard />);
        await waitFor(() => screen.getByTestId("flow-card-a"));
        await userEvent.click(screen.getByTestId("flow-card-a"));
        expect(push).toHaveBeenCalledWith("/flow?id=a");
    });

    it("shows the empty state when there are no flows", async () => {
        render(<Dashboard />);
        await waitFor(() =>
            expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument(),
        );
    });

    it("opens settings from the gear", async () => {
        await persistRound(mk("a"));
        render(<Dashboard />);
        await waitFor(() => screen.getByTestId("dashboard-settings"));
        await userEvent.click(screen.getByTestId("dashboard-settings"));
        expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    });
});
