import "fake-indexeddb/auto";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

import Dashboard from "@/components/dashboard/Dashboard";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { emptyScouting, makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import { invalidateFlowSummaries, persistFlow } from "@/lib/persistence/flowPersistence";
import { useFlowStore } from "@/lib/store/useFlowStore";

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
        scouting: { ...emptyScouting(), affSchool: id, tournament: "Berkeley" },
        ...over,
    };
}

/** Fire a bare keydown at the window, where the overlay's capture layer lives. */
function press(key: string) {
    fireEvent.keyDown(window, { key });
}

afterEach(() => {
    cleanup();
    useFlowStore.getState().setSettingsOpen(false);
    useFlowStore.getState().setCheatsheetOpen(false);
});

beforeEach(async () => {
    await flowDb.flows.clear();
    invalidateFlowSummaries();
    push.mockReset();
    localStorage.clear();
    useFlowStore.setState({ keytipOverrides: {} });
    useFlowStore.getState().setSettingsOpen(false);
    useFlowStore.getState().setCheatsheetOpen(false);
});

describe("dashboard keytips", () => {
    it("f paints the root tips and Escape clears them", async () => {
        await persistFlow(mk("a", { updatedAt: 5 }));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        expect(screen.queryByTestId("keytip-root.import")).toBeNull();
        press("f");
        expect(screen.getByTestId("keytip-root.import")).toBeInTheDocument();
        expect(screen.getByTestId("keytip-root.new")).toBeInTheDocument();
        expect(screen.getByTestId("keytip-root.search")).toBeInTheDocument();
        expect(screen.getByTestId("keytip-root.flows")).toBeInTheDocument();

        press("Escape");
        expect(screen.queryByTestId("keytip-root.import")).toBeNull();
    });

    it("does not activate while the search box is focused", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        fireEvent.keyDown(screen.getByTestId("dashboard-search"), { key: "f" });
        expect(screen.queryByTestId("keytip-root.import")).toBeNull();
    });

    it("Escape blurs the search box so the trigger works again", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        const search = screen.getByTestId("dashboard-search");
        fireEvent.keyDown(search, { key: "s" });
        search.focus();
        expect(document.activeElement).toBe(search);

        fireEvent.keyDown(search, { key: "Escape" });
        expect(document.activeElement).not.toBe(search);

        press("f");
        expect(screen.getByTestId("keytip-root.import")).toBeInTheDocument();
    });

    it("respects a configured trigger override", async () => {
        useFlowStore.getState().setKeytipOverride("trigger", "k");
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        expect(screen.queryByTestId("keytip-root.import")).toBeNull();
        press("k");
        expect(screen.getByTestId("keytip-root.import")).toBeInTheDocument();
    });

    it("t opens the trash", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("t");
        expect(push).toHaveBeenCalledWith("/trash");
    });

    it("s focuses the search box", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("s");
        expect(document.activeElement).toBe(screen.getByTestId("dashboard-search"));
    });

    it("? opens the shortcut cheatsheet and , opens settings", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("?");
        expect(useFlowStore.getState().cheatsheetOpen).toBe(true);

        press("f");
        press(",");
        expect(useFlowStore.getState().settingsOpen).toBe(true);
    });

    it("n opens the new-flow menu and a key creates that flow", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("n");
        await screen.findByTestId("new-flow-role-aff");
        press("a");
        await waitFor(() => expect(push).toHaveBeenCalled());
        expect(push.mock.calls[0][0]).toContain("/flow?id=");
    });

    it("l focuses the first card and Enter opens it", async () => {
        await persistFlow(mk("a", { updatedAt: 9 }));
        await persistFlow(mk("b", { updatedAt: 5 }));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("l");
        expect(document.activeElement).toBe(screen.getByTestId("flow-card-a"));

        press("ArrowRight");
        expect(document.activeElement).toBe(screen.getByTestId("flow-card-b"));

        fireEvent.keyDown(document.activeElement!, { key: "Enter" });
        expect(push).toHaveBeenCalledWith("/flow?id=b");
    });

    it("l then s focuses the sort control", async () => {
        await persistFlow(mk("a"));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("l");
        press("s");
        expect(document.activeElement).toBe(screen.getByTestId("sort-select"));
    });

    it("l then t groups by tournament", async () => {
        await persistFlow(mk("a", { scouting: { ...emptyScouting(), tournament: "Berkeley" } }));
        await persistFlow(mk("b", { scouting: { ...emptyScouting(), tournament: "TOC" } }));
        renderDashboard();
        await waitFor(() => screen.getByTestId("flow-card-a"));

        press("f");
        press("l");
        press("t");
        await waitFor(() =>
            expect(screen.getByTestId("group-toggle")).toHaveAttribute("aria-checked", "true"),
        );
    });
});
