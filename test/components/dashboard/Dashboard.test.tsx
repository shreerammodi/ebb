import "fake-indexeddb/auto";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import Dashboard from "@/components/dashboard/Dashboard";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { emptyScouting, makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import { invalidateFlowSummaries, persistFlow } from "@/lib/persistence/flowPersistence";
import { useFlowStore } from "@/lib/store/useFlowStore";

// The real app mounts <SettingsPanel> in the root layout, not in <Dashboard>.
function renderDashboard() {
    return render(
        <TooltipProvider>
            <Dashboard />
            <SettingsPanel />
        </TooltipProvider>,
    );
}

function mk(id: string, over: Partial<FlowRound> = {}): FlowRound {
    return {
        ...makeFlowRound({ role: "aff" }),
        id,
        createdAt: 1,
        updatedAt: 1,
        scouting: {
            ...emptyScouting(),
            affSchool: id === "a" ? "Westwood" : "Mission",
            tournament: "Berkeley",
        },
        ...over,
    };
}

afterEach(() => {
    cleanup();
});

beforeEach(async () => {
    await flowDb.flows.clear();
    invalidateFlowSummaries();
    push.mockReset();
    localStorage.clear();
    useFlowStore.getState().setSettingsOpen(false);
});

describe("Dashboard", () => {
    it("lists live flows and excludes trashed", async () => {
        await persistFlow(mk("a", { updatedAt: 5 }));
        await persistFlow(mk("b", { updatedAt: 2, deletedAt: 1 }));
        renderDashboard();
        await waitFor(() => expect(screen.getByText("Westwood")).toBeInTheDocument());
        expect(screen.queryByText("Mission")).not.toBeInTheDocument();
    });

    it("navigates to the editor on card click", async () => {
        await persistFlow(mk("a"));
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
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("dashboard-settings"));
        await userEvent.click(screen.getByTestId("dashboard-settings"));
        expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    });

    it("filters by scouting fields from the search box", async () => {
        await persistFlow(mk("a"));
        await persistFlow(
            mk("b", { scouting: { ...emptyScouting(), affSchool: "Mission", tournament: "TOC" } }),
        );
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));
        await userEvent.type(screen.getByTestId("dashboard-search"), "toc");
        await waitFor(() => expect(screen.queryByTestId("flow-card-a")).not.toBeInTheDocument());
        expect(screen.getByTestId("flow-card-b")).toBeInTheDocument();
    });
});

describe("Dashboard first-run", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("creates an Aff flow and navigates from the empty state", async () => {
        renderDashboard();
        await waitFor(() => screen.getByTestId("empty-start-aff"));
        await userEvent.click(screen.getByTestId("empty-start-aff"));
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/flow\?id=/)),
        );
        const rounds = await flowDb.flows.toArray();
        expect(rounds).toHaveLength(1);
        expect(rounds[0].role).toBe("aff");
        expect(rounds[0].sheets.some((s) => s.kind === "cx")).toBe(true);
    });

    it("creates a Neg flow from the empty state", async () => {
        renderDashboard();
        await waitFor(() => screen.getByTestId("empty-start-neg"));
        await userEvent.click(screen.getByTestId("empty-start-neg"));
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/flow\?id=/)),
        );
        const rounds = await flowDb.flows.toArray();
        expect(rounds[0].role).toBe("neg");
    });

    it("opens the guide when the header Guide button is clicked", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));
        fireEvent.click(screen.getByTestId("dashboard-guide"));
        expect(await screen.findByTestId("cheatsheet-panel")).toBeInTheDocument();
    });
});
