import "fake-indexeddb/auto";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";
import { persistRound, softDeleteRound } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { useRoundStore } from "@/lib/store/useRoundStore";

import Dashboard from "./Dashboard";

function renderDashboard() {
    return render(
        <TooltipProvider>
            <Dashboard />
        </TooltipProvider>,
    );
}

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

afterEach(() => {
    cleanup();
    // react-remove-scroll adds `block-interactivity-{n}` classes to <body>
    // while a Radix Dialog is open, applying `pointer-events: none` via an
    // injected stylesheet. Clean these up so they don't bleed across tests.
    Array.from(document.body.classList)
        .filter((c) => c.startsWith("block-interactivity-"))
        .forEach((c) => document.body.classList.remove(c));
    document.body.style.pointerEvents = "";
});

beforeEach(async () => {
    await db.rounds.clear();
    await db.searchIndex.clear();
    push.mockReset();
    localStorage.clear();
    useRoundStore.getState().setGuideOpen(false);
    useRoundStore.getState().setSettingsOpen(false);
});

describe("Dashboard", () => {
    it("lists live flows and excludes trashed", async () => {
        await persistRound(mk("a", { updatedAt: 5 }));
        await persistRound(mk("b", { updatedAt: 2, deletedAt: 1 }));
        renderDashboard();
        await waitFor(() => expect(screen.getByText("Westwood")).toBeInTheDocument());
        expect(screen.queryByText("Mission")).not.toBeInTheDocument();
    });

    it("navigates to the editor on card click", async () => {
        await persistRound(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));
        await userEvent.click(screen.getByTestId("flow-card-a"));
        expect(push).toHaveBeenCalledWith("/flow?id=a");
    });

    it("shows the empty state when there are no flows", async () => {
        renderDashboard();
        await waitFor(() => expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument());
    });

    it("opens settings from the gear", async () => {
        await persistRound(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("dashboard-settings"));
        await userEvent.click(screen.getByTestId("dashboard-settings"));
        expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    });
});

describe("Dashboard first-run", () => {
    beforeEach(() => {
        localStorage.clear();
        useRoundStore.getState().setGuideOpen(false);
    });

    it("does not auto-open the guide; it shows the teaching empty state instead", async () => {
        renderDashboard();
        await waitFor(() => expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument());
        expect(useRoundStore.getState().guideOpen).toBe(false);
    });

    it("creates an Aff flow and navigates from the empty state", async () => {
        renderDashboard();
        await waitFor(() => screen.getByTestId("empty-start-aff"));
        await userEvent.click(screen.getByTestId("empty-start-aff"));
        expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/flow\?id=/));
        expect(useRoundStore.getState().round?.role).toBe("aff");
    });

    it("creates a Neg flow from the empty state", async () => {
        renderDashboard();
        await waitFor(() => screen.getByTestId("empty-start-neg"));
        await userEvent.click(screen.getByTestId("empty-start-neg"));
        expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/flow\?id=/));
        expect(useRoundStore.getState().round?.role).toBe("neg");
    });

    it("opens the guide on demand from the empty-state link", async () => {
        renderDashboard();
        await waitFor(() => screen.getByTestId("empty-open-guide"));
        await userEvent.click(screen.getByTestId("empty-open-guide"));
        expect(useRoundStore.getState().guideOpen).toBe(true);
    });

    it("opens the guide from the Guide button", async () => {
        await persistRound(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));
        await userEvent.click(screen.getByTestId("dashboard-guide"));
        expect(useRoundStore.getState().guideOpen).toBe(true);
    });
});
