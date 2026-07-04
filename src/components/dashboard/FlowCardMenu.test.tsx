import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));

import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import { listFlows, listFlowTrash, persistFlow } from "@/lib/persistence/flowPersistence";

import FlowCardMenu from "./FlowCardMenu";

function mk(id: string): FlowRound {
    return { ...makeFlowRound("aff"), id, createdAt: 1, updatedAt: 1 };
}

beforeEach(async () => {
    await flowDb.flows.clear();
});

describe("FlowCardMenu", () => {
    it("soft-deletes the flow and calls onChanged", async () => {
        await persistFlow(mk("a"));
        const onChanged = vi.fn();
        render(<FlowCardMenu id="a" onViewDetails={() => {}} onChanged={onChanged} />);
        await userEvent.click(screen.getByTestId("kebab-a"));
        await userEvent.click(await screen.findByTestId("kebab-delete-a"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect((await listFlows()).length).toBe(0);
        expect((await listFlowTrash()).map((s) => s.id)).toEqual(["a"]);
    });
});
