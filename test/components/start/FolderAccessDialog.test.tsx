import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const os = { name: "windows" };
vi.mock("@/lib/update/adapter", () => ({
    getSystemInfo: () => Promise.resolve([os.name, "x86_64"]),
}));

const allow = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => allow(...a) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FolderAccessDialog from "@/components/start/FolderAccessDialog";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { FLOWS_DIR, installFakeFlowFs, type FakeFlowFs } from "../../support/fakeFlowFs";

let fs: FakeFlowFs;

beforeEach(() => {
    fs = installFakeFlowFs();
    os.name = "windows";
    allow.mockReset();
    useFlowStore.setState({ flowsDir: null });
});

describe("FolderAccessDialog", () => {
    it("asks only when Windows refuses the flows folder", async () => {
        fs.blockedDirs.add(FLOWS_DIR);
        render(<FolderAccessDialog />);
        expect(await screen.findByTestId("folder-access")).toBeTruthy();
        expect(document.activeElement).toBe(screen.getByTestId("folder-access-allow"));
    });

    /** Render, then give the launch check time to land. */
    async function settled() {
        render(<FolderAccessDialog />);
        await new Promise((r) => setTimeout(r, 20));
    }

    it("stays away from a folder that takes writes", async () => {
        await settled();
        expect(screen.queryByTestId("folder-access")).toBeNull();
    });

    it("never asks off Windows, where nothing refuses a folder this way", async () => {
        os.name = "macos";
        fs.blockedDirs.add(FLOWS_DIR);
        await settled();
        expect(screen.queryByTestId("folder-access")).toBeNull();
    });

    it("closes once allowing ebb makes the folder writable", async () => {
        fs.blockedDirs.add(FLOWS_DIR);
        allow.mockImplementation(() => {
            fs.blockedDirs.delete(FLOWS_DIR);
            return Promise.resolve(true);
        });
        render(<FolderAccessDialog />);
        fireEvent.click(await screen.findByTestId("folder-access-allow"));

        await waitFor(() => expect(screen.queryByTestId("folder-access")).toBeNull());
        expect(allow).toHaveBeenCalledWith("allow_in_controlled_folders");
    });

    // A school-managed laptop can accept the change and keep enforcing its
    // own list, so the folder is checked again rather than trusted.
    it("says so when the folder is still blocked after allowing", async () => {
        fs.blockedDirs.add(FLOWS_DIR);
        allow.mockResolvedValue(true);
        render(<FolderAccessDialog />);
        fireEvent.click(await screen.findByTestId("folder-access-allow"));

        expect(await screen.findByTestId("folder-access-note")).toBeTruthy();
        expect(screen.getByTestId("folder-access")).toBeTruthy();
    });

    it("moves new flows to a chosen folder only once it takes writes", async () => {
        fs.blockedDirs.add(FLOWS_DIR);
        fs.blockedDirs.add("/also/blocked");
        render(<FolderAccessDialog />);

        fs.nextDirectory = "/also/blocked";
        fireEvent.click(await screen.findByTestId("folder-access-choose"));
        expect(await screen.findByTestId("folder-access-note")).toBeTruthy();
        expect(useFlowStore.getState().flowsDir).toBeNull();

        fs.nextDirectory = "/home/test/flows";
        fireEvent.click(screen.getByTestId("folder-access-choose"));
        await waitFor(() => expect(screen.queryByTestId("folder-access")).toBeNull());
        expect(useFlowStore.getState().flowsDir).toBe("/home/test/flows");
    });
});
