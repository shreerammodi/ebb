import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import { listFlows } from "@/lib/persistence/flowPersistence";

import ImportExportControls from "./ImportExportControls";

function mk(id: string): FlowRound {
    return { ...makeFlowRound("aff"), id, createdAt: 1, updatedAt: 1 };
}

beforeEach(async () => {
    await flowDb.flows.clear();
});

describe("ImportExportControls", () => {
    it("imports a single-flow file as a new flow", async () => {
        const onChanged = vi.fn();
        render(<ImportExportControls onChanged={onChanged} />);
        const file = new File([JSON.stringify({ version: 3, round: mk("orig") })], "flow.json", {
            type: "application/json",
        });
        await userEvent.upload(screen.getByTestId("import-input"), file);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const live = await listFlows();
        expect(live.length).toBe(1);
        expect(live[0].id).not.toBe("orig");
    });

    it("imports a backup file with multiple flows", async () => {
        const onChanged = vi.fn();
        render(<ImportExportControls onChanged={onChanged} />);
        const file = new File(
            [
                JSON.stringify({
                    version: 3,
                    kind: "backup",
                    rounds: [mk("a"), mk("b")],
                }),
            ],
            "backup.json",
            { type: "application/json" },
        );
        await userEvent.upload(screen.getByTestId("import-input"), file);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect((await listFlows()).length).toBe(2);
    });
});
