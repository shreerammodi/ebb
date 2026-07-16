/**
 * AppRoot integration tests.
 *
 * IMPORTANT: fake-indexeddb/auto MUST be imported first so it polyfills
 * the global indexedDB before Dexie is imported.
 */
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateProvider } from "@/components/update/UpdateProvider";
import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import { persistFlow } from "@/lib/persistence/flowPersistence";
import { useFlowStore } from "@/lib/store/useFlowStore";

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
import AppRoot from "@/components/flow/AppRoot";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRound(overrides: Partial<FlowRound> = {}): FlowRound {
    return { ...makeFlowRound("aff"), ...overrides };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
    await flowDb.flows.clear();
    mockSearch = "";
    replace.mockReset();
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
    });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AppRoot", () => {
    it("redirects to / when no ?id= param", async () => {
        mockSearch = "";
        render(
            <TooltipProvider>
                <UpdateProvider>
                    <AppRoot />
                </UpdateProvider>
            </TooltipProvider>,
        );
        await waitFor(() => {
            expect(replace).toHaveBeenCalledWith("/");
        });
    });

    it("redirects to / when ?id= does not match any round", async () => {
        mockSearch = "id=nonexistent_id";
        render(
            <TooltipProvider>
                <UpdateProvider>
                    <AppRoot />
                </UpdateProvider>
            </TooltipProvider>,
        );
        await waitFor(() => {
            expect(replace).toHaveBeenCalledWith("/");
        });
    });

    it("shows Workspace when ?id= matches a live round", async () => {
        const round = makeRound();
        await persistFlow(round);
        mockSearch = `id=${round.id}`;

        render(
            <TooltipProvider>
                <UpdateProvider>
                    <AppRoot />
                </UpdateProvider>
            </TooltipProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId("workspace")).toBeInTheDocument();
        });
    });

    it("redirects to / when the round is trashed", async () => {
        const round = makeRound({ deletedAt: 1 });
        await persistFlow(round);
        mockSearch = `id=${round.id}`;

        render(
            <TooltipProvider>
                <UpdateProvider>
                    <AppRoot />
                </UpdateProvider>
            </TooltipProvider>,
        );

        await waitFor(() => {
            expect(replace).toHaveBeenCalledWith("/");
        });
    });
});
