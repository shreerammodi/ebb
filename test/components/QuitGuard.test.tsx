import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the flush did, in the order it did it. */
const order: string[] = [];

const invoke = vi.fn();
let flushHandler: ((e: { payload: unknown }) => void) | null = null;
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
    invoke: (...a: unknown[]) => {
        order.push("report");
        return invoke(...a);
    },
}));
vi.mock("@tauri-apps/api/event", () => ({
    listen: (name: string, cb: (e: { payload: unknown }) => void) => {
        if (name === "app:flush") flushHandler = cb;
        return Promise.resolve(unlisten);
    },
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
    getCurrentWebviewWindow: () => ({ label: "win-0" }),
}));

const saveBeforeLeaving = vi.fn();
const resolveUnsaved = vi.fn();
vi.mock("@/lib/commands/fileCommands", () => ({
    saveBeforeLeaving: () => {
        order.push("save");
        return saveBeforeLeaving();
    },
    resolveUnsaved: () => {
        order.push("ask");
        return resolveUnsaved();
    },
}));

const shutdownCollab = vi.fn();
vi.mock("@/lib/collab/runtime", () => ({
    shutdownCollab: () => {
        order.push("hang up");
        return shutdownCollab();
    },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

vi.mock("@/lib/update/adapter", () => ({ isDesktop: () => true }));

import QuitGuard from "@/components/QuitGuard";

beforeEach(() => {
    invoke.mockReset();
    saveBeforeLeaving.mockReset();
    resolveUnsaved.mockReset();
    shutdownCollab.mockReset();
    shutdownCollab.mockResolvedValue(undefined);
    toastError.mockReset();
    order.length = 0;
    flushHandler = null;
});

/** Mount, wait for the listener, then act as the shell asking for a flush. */
async function requestQuit() {
    render(<QuitGuard />);
    await waitFor(() => expect(flushHandler).not.toBeNull());
    flushHandler?.({ payload: undefined });
}

describe("QuitGuard", () => {
    it("writes the open flow before letting the app exit", async () => {
        saveBeforeLeaving.mockResolvedValue(true);

        await requestQuit();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith("finish_quit", { saved: true }));
        expect(saveBeforeLeaving).toHaveBeenCalled();
    });

    // The round is what the exit is holding for, so it reaches disk first. The
    // session comes down before the report because a window that exits without
    // saying so leaves its partners looking at a peer that is gone until QUIC
    // times the connection out, which is tens of seconds of a chip that reads
    // connected.
    it("saves the flow, then hangs up on the partners, then reports back", async () => {
        saveBeforeLeaving.mockResolvedValue(true);

        await requestQuit();

        await waitFor(() => expect(invoke).toHaveBeenCalled());
        expect(order).toEqual(["save", "hang up", "report"]);
    });

    // A flow that reached disk is not put back at risk by a link that would
    // not close, and the endpoint dies with the process either way.
    it("still reports the flow saved when the hang-up fails", async () => {
        saveBeforeLeaving.mockResolvedValue(true);
        shutdownCollab.mockRejectedValue(new Error("the endpoint refused to stop"));

        await requestQuit();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith("finish_quit", { saved: true }));
        expect(toastError).not.toHaveBeenCalled();
    });

    // The shell closes a window that does not answer in time, so the hold
    // goes out before the question: a debater reading the dialog must not have
    // the window closed under them.
    it("asks before a failed save leaves, holding the deadline first", async () => {
        saveBeforeLeaving.mockResolvedValue(false);
        resolveUnsaved.mockResolvedValue(true);

        await requestQuit();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith("finish_quit", { saved: true }));
        expect(invoke.mock.calls[0]).toEqual(["hold_quit"]);
        expect(order).toEqual(["save", "report", "ask", "hang up", "report"]);
    });

    it("cancels the exit, and keeps the partners, when the debater cancels", async () => {
        saveBeforeLeaving.mockResolvedValue(false);
        resolveUnsaved.mockResolvedValue(false);

        await requestQuit();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith("finish_quit", { saved: false }));
        expect(shutdownCollab).not.toHaveBeenCalled();
    });

    it("treats a thrown save as a failed one and asks", async () => {
        saveBeforeLeaving.mockRejectedValue(new Error("boom"));
        resolveUnsaved.mockResolvedValue(false);

        await requestQuit();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith("finish_quit", { saved: false }));
        expect(resolveUnsaved).toHaveBeenCalled();
    });
});
