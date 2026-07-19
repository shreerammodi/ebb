import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));

import TrashView from "@/components/trash/TrashView";
import { emptyScouting, makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import {
    invalidateFlowSummaries,
    listFlows,
    persistFlow,
    softDeleteFlow,
} from "@/lib/persistence/flowPersistence";

function mk(id: string): FlowRound {
    return {
        ...makeFlowRound({ role: "aff" }),
        id,
        createdAt: 1,
        updatedAt: 1,
        scouting: { ...emptyScouting(), affSchool: id },
    };
}

beforeEach(async () => {
    await flowDb.flows.clear();
    invalidateFlowSummaries();
});

describe("TrashView", () => {
    it("restores a trashed flow", async () => {
        await persistFlow(mk("a"));
        await softDeleteFlow("a");
        render(<TrashView />);
        await waitFor(() => screen.getByTestId("trash-restore-a"));
        await userEvent.click(screen.getByTestId("trash-restore-a"));
        await waitFor(async () => expect((await listFlows()).map((s) => s.id)).toEqual(["a"]));
    });

    it("permanently deletes a flow after confirming in the dialog", async () => {
        await persistFlow(mk("a"));
        await softDeleteFlow("a");
        render(<TrashView />);
        await waitFor(() => screen.getByTestId("trash-delete-a"));
        await userEvent.click(screen.getByTestId("trash-delete-a"));
        // A confirm dialog appears; deletion only happens on accept.
        const accept = await screen.findByTestId("confirm-accept");
        await userEvent.click(accept);
        await waitFor(async () => expect(await flowDb.flows.get("a")).toBeUndefined());
    });

    it("does not delete when the confirm dialog is cancelled", async () => {
        await persistFlow(mk("a"));
        await softDeleteFlow("a");
        render(<TrashView />);
        await waitFor(() => screen.getByTestId("trash-delete-a"));
        await userEvent.click(screen.getByTestId("trash-delete-a"));
        await userEvent.click(await screen.findByTestId("confirm-cancel"));
        // Still present — cancel is safe.
        expect(await flowDb.flows.get("a")).toBeDefined();
    });
});
