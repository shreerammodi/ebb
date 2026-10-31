import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({
    toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));

const navigateToStart = vi.fn();
const navigateToFlow = vi.fn();
vi.mock("@/lib/commands/flowNav", () => ({
    navigateToStart: () => navigateToStart(),
    navigateToFlow: (p: string) => navigateToFlow(p),
    flowRouteFor: (p: string) => `/flow?path=${encodeURIComponent(p)}`,
}));

import { closeOpenFlow, dragOpenFlow, saveOpenFlow } from "@/lib/commands/fileCommands";
import { makeFlowRound } from "@/lib/model/flow";
import { serializeFlow } from "@/lib/persistence/flowFile";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { installFakeFlowFs, type FakeFlowFs } from "../../support/fakeFlowFs";

let fs: FakeFlowFs;

beforeEach(() => {
    fs = installFakeFlowFs();
    toastError.mockReset();
    navigateToStart.mockReset();
    const round = makeFlowRound({});
    fs.files.set("/a.ebb", serializeFlow(round));
    useFlowStore.setState({ round, docPath: "/a.ebb" });
});

describe("saveOpenFlow", () => {
    it("reports success so callers can act on it", async () => {
        expect(await saveOpenFlow()).toBe(true);
    });

    it("reports failure rather than resolving quietly", async () => {
        fs.failWrites = "disk full";
        expect(await saveOpenFlow()).toBe(false);
    });

    it("counts an empty editor as safe", async () => {
        useFlowStore.setState({ round: null, docPath: null });
        expect(await saveOpenFlow()).toBe(true);
    });
});

describe("closeOpenFlow", () => {
    it("writes the flow and leaves the editor", async () => {
        await closeOpenFlow();

        expect(fs.writes).toContain("/a.ebb");
        expect(useFlowStore.getState().round).toBeNull();
        expect(navigateToStart).toHaveBeenCalled();
    });

    it("keeps the round on screen when the save fails", async () => {
        // Closing is the instinctive move when something looks wrong, which is
        // exactly when saving is failing. Discarding the round here would
        // destroy it at the worst possible moment.
        fs.failWrites = "disk full";

        await closeOpenFlow();

        expect(useFlowStore.getState().round).not.toBeNull();
        expect(useFlowStore.getState().docPath).toBe("/a.ebb");
        expect(navigateToStart).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalled();
    });
});

describe("dragOpenFlow", () => {
    it("writes the flow before dragging it out", async () => {
        await dragOpenFlow();

        expect(fs.writes).toContain("/a.ebb");
        expect(fs.dragged).toEqual(["/a.ebb"]);
    });

    it("sends nothing when the save fails", async () => {
        // The file on disk would be missing what is on screen.
        fs.failWrites = "disk full";

        await dragOpenFlow();

        expect(fs.dragged).toEqual([]);
        expect(toastError).toHaveBeenCalled();
    });
});
