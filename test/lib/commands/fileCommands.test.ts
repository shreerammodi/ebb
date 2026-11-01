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
import { useLeaveDialog, type LeaveChoice } from "@/lib/store/useLeaveDialog";

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

    /** Close with the flows folder refusing writes, answering the question. */
    async function closeAnswering(...choices: LeaveChoice[]) {
        const closing = closeOpenFlow();
        for (const choice of choices) {
            await vi.waitFor(() => expect(useLeaveDialog.getState().open).toBe(true));
            useLeaveDialog.getState().answer(choice);
        }
        await closing;
    }

    // Closing is the instinctive move when something looks wrong, which is
    // exactly when saving is failing. Cancel keeps the round where it was.
    it("keeps the round on screen when the save fails and the debater cancels", async () => {
        fs.failFlowWrites = "access denied";

        await closeAnswering("cancel");

        expect(useFlowStore.getState().docPath).toBe("/a.ebb");
        expect(navigateToStart).not.toHaveBeenCalled();
        expect(fs.swaps.has("/a.ebb")).toBe(true);
    });

    it("never asks when the file received the round", async () => {
        await closeOpenFlow();
        expect(useLeaveDialog.getState().open).toBe(false);
    });

    it("drops the recovery copy when the debater will not save", async () => {
        fs.failFlowWrites = "access denied";

        await closeAnswering("discard");

        expect(navigateToStart).toHaveBeenCalled();
        expect(fs.swaps.has("/a.ebb")).toBe(false);
    });

    it("asks again when Save still cannot write, and leaves once Save As does", async () => {
        fs.failFlowWrites = "access denied";
        fs.nextSave = "/elsewhere/a.ebb";
        // The fake refuses every flow write while this is set, so Save As has
        // to be let through by hand once Save has failed.
        const closing = closeOpenFlow();
        await vi.waitFor(() => expect(useLeaveDialog.getState().open).toBe(true));
        useLeaveDialog.getState().answer("save");
        await vi.waitFor(() => expect(useLeaveDialog.getState().open).toBe(true));
        fs.failFlowWrites = null;
        useLeaveDialog.getState().answer("saveAs");
        await closing;

        expect(toastError).toHaveBeenCalled();
        expect(fs.files.has("/elsewhere/a.ebb")).toBe(true);
        expect(navigateToStart).toHaveBeenCalled();
        expect(fs.swaps.has("/a.ebb")).toBe(false);
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
