import { render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowStore } from "@/lib/store/useFlowStore";

const listeners = new Map<string, (e: { payload: string }) => void>();
const unlisten = vi.fn();
const invoke = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn((event: string, handler: (e: { payload: string }) => void) => {
        listeners.set(event, handler);
        return Promise.resolve(unlisten);
    }),
}));

vi.mock("@tauri-apps/api/core", () => ({
    invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@/lib/keymap/menuDispatch", () => ({
    dispatchMenuCommand: vi.fn(),
    SELECT_ALL_MENU_ID: "selectAll",
}));

import { MENU_COMMAND_IDS } from "@/lib/keymap/accelerator";
import { dispatchMenuCommand } from "@/lib/keymap/menuDispatch";
import {
    restoreMenuAccelerators,
    suspendMenuAccelerators,
    useDesktopMenu,
} from "@/lib/keymap/useDesktopMenu";

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
    useFlowStore.setState({ keymapOverrides: {} });
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

describe("accelerator sync", () => {
    it("pushes the effective accelerators to rebuild_menu on mount", async () => {
        enableDesktop();
        render(<Harness />);
        await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
        const [command, payload] = invoke.mock.calls[0]! as [
            string,
            { accels: Record<string, string> },
        ];
        expect(command).toBe("rebuild_menu");
        expect(payload.accels["edit.undo"]).toBeTruthy();
        expect(payload.accels["sheet.next"]).toBe(""); // bare "]" cannot be one
    });

    it("re-syncs when keymap overrides change", async () => {
        enableDesktop();
        render(<Harness />);
        await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
        act(() => {
            useFlowStore.setState({ keymapOverrides: { "sheet.rename": "F1" } });
        });
        await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
        const [, payload] = invoke.mock.calls[1]! as [string, { accels: Record<string, string> }];
        expect(payload.accels["sheet.rename"]).toBe("F1");
    });

    it("skips redundant rebuilds when accelerators are unchanged", async () => {
        enableDesktop();
        render(<Harness />);
        await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
        act(() => {
            // A new-but-equal overrides object must not trigger a rebuild.
            useFlowStore.setState({ keymapOverrides: {} });
        });
        await Promise.resolve();
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it("does not invoke in the web build", async () => {
        render(<Harness />);
        await Promise.resolve();
        expect(invoke).not.toHaveBeenCalled();
    });
});

describe("suspendMenuAccelerators", () => {
    it("strips every menu command id and selectAll to an empty accelerator", async () => {
        enableDesktop();
        suspendMenuAccelerators();
        await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
        const [command, payload] = invoke.mock.calls[0]! as [
            string,
            { accels: Record<string, string> },
        ];
        expect(command).toBe("rebuild_menu");
        for (const id of MENU_COMMAND_IDS) expect(payload.accels[id]).toBe("");
        expect(payload.accels["selectAll"]).toBe("");
    });

    it("does not invoke in the web build", async () => {
        suspendMenuAccelerators();
        await Promise.resolve();
        expect(invoke).not.toHaveBeenCalled();
    });
});

describe("restoreMenuAccelerators", () => {
    it("pushes the effective keymap's accelerators", async () => {
        enableDesktop();
        useFlowStore.setState({ keymapOverrides: { "sheet.rename": "F1" } });
        restoreMenuAccelerators();
        await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
        const [command, payload] = invoke.mock.calls[0]! as [
            string,
            { accels: Record<string, string> },
        ];
        expect(command).toBe("rebuild_menu");
        expect(payload.accels["sheet.rename"]).toBe("F1");
    });

    it("does not invoke in the web build", async () => {
        restoreMenuAccelerators();
        await Promise.resolve();
        expect(invoke).not.toHaveBeenCalled();
    });
});
