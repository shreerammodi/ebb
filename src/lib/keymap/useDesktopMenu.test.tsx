import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listeners = new Map<string, (e: { payload: string }) => void>();
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn((event: string, handler: (e: { payload: string }) => void) => {
        listeners.set(event, handler);
        return Promise.resolve(unlisten);
    }),
}));

vi.mock("./menuDispatch", () => ({ dispatchMenuCommand: vi.fn() }));

import { dispatchMenuCommand } from "./menuDispatch";
import { useDesktopMenu } from "./useDesktopMenu";

function Harness() {
    useDesktopMenu();
    return null;
}

function enableDesktop() {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function disableDesktop() {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    delete (window as unknown as Record<string, unknown>).__TAURI__;
}

beforeEach(() => {
    disableDesktop();
    listeners.clear();
    vi.clearAllMocks();
});

afterEach(disableDesktop);

describe("useDesktopMenu", () => {
    it("routes menu:command payloads through dispatchMenuCommand", async () => {
        enableDesktop();
        render(<Harness />);
        await vi.waitFor(() => expect(listeners.has("menu:command")).toBe(true));
        listeners.get("menu:command")!({ payload: "edit.undo" });
        expect(dispatchMenuCommand).toHaveBeenCalledWith("edit.undo");
    });

    it("does not listen in the web build", async () => {
        render(<Harness />);
        await Promise.resolve();
        expect(listeners.size).toBe(0);
    });

    it("unlistens on unmount", async () => {
        enableDesktop();
        const { unmount } = render(<Harness />);
        await vi.waitFor(() => expect(listeners.has("menu:command")).toBe(true));
        unmount();
        expect(unlisten).toHaveBeenCalled();
    });
});
