import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowStore } from "@/lib/store/useFlowStore";

import {
    downloadUpdate,
    fetchManifest,
    getCurrentVersion,
    installAndRelaunch,
    isDesktop,
} from "./adapter";
import type { UpdateManifest } from "./types";
import { useAutoUpdate } from "./useAutoUpdate";

vi.mock("./adapter", () => ({
    isDesktop: vi.fn(() => true),
    fetchManifest: vi.fn(),
    getCurrentVersion: vi.fn(async () => "0.3.4"),
    downloadUpdate: vi.fn(),
    installAndRelaunch: vi.fn(),
}));

const fetchManifestMock = vi.mocked(fetchManifest);
const downloadUpdateMock = vi.mocked(downloadUpdate);
const installAndRelaunchMock = vi.mocked(installAndRelaunch);
const isDesktopMock = vi.mocked(isDesktop);
const getCurrentVersionMock = vi.mocked(getCurrentVersion);

const newerManifest: UpdateManifest = { version: "0.3.5", platforms: {} };

function makeStaged(version = "0.3.5") {
    return { version, install: vi.fn().mockResolvedValue(undefined) };
}

describe("useAutoUpdate", () => {
    beforeEach(() => {
        isDesktopMock.mockReturnValue(true);
        getCurrentVersionMock.mockResolvedValue("0.3.4");
        useFlowStore.getState().setUpdateConfig({ autoCheckEnabled: false });
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("reports up to date after a manual check that finds nothing newer", async () => {
        fetchManifestMock.mockResolvedValue(null);
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.checkNow());
        expect(result.current.state).toEqual({ status: "upToDate" });
    });

    it("reports a failed manual check instead of staying silent", async () => {
        fetchManifestMock.mockRejectedValue(new Error("offline"));
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.checkNow());
        expect(result.current.state).toEqual({
            status: "error",
            message: "Couldn't check for updates.",
        });
    });

    it("keeps auto-check failures silent (idle, no error surfaced)", async () => {
        useFlowStore.getState().setUpdateConfig({ autoCheckEnabled: true });
        fetchManifestMock.mockRejectedValue(new Error("offline"));
        const { result } = renderHook(() => useAutoUpdate());
        await waitFor(() => expect(fetchManifestMock).toHaveBeenCalled());
        await waitFor(() => expect(result.current.state).toEqual({ status: "idle" }));
    });

    it("downloads a newer release without installing, then prompts (ready)", async () => {
        fetchManifestMock.mockResolvedValue(newerManifest);
        const staged = makeStaged();
        downloadUpdateMock.mockResolvedValue(staged);
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.checkNow());
        expect(result.current.state).toEqual({ status: "ready", manifest: newerManifest });
        expect(downloadUpdateMock).toHaveBeenCalledOnce();
        expect(installAndRelaunchMock).not.toHaveBeenCalled();
        expect(staged.install).not.toHaveBeenCalled();
    });

    it("installs and relaunches only when the user confirms", async () => {
        fetchManifestMock.mockResolvedValue(newerManifest);
        const staged = makeStaged();
        downloadUpdateMock.mockResolvedValue(staged);
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.checkNow());
        await act(() => result.current.installAndRestart());
        expect(installAndRelaunchMock).toHaveBeenCalledWith(staged);
    });

    it("does not re-download when the staged version is already current", async () => {
        fetchManifestMock.mockResolvedValue(newerManifest);
        downloadUpdateMock.mockResolvedValue(makeStaged());
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.checkNow());
        await act(() => result.current.checkNow());
        expect(downloadUpdateMock).toHaveBeenCalledOnce();
        expect(result.current.state).toEqual({ status: "ready", manifest: newerManifest });
    });

    it("ignores installAndRestart when nothing is staged", async () => {
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.installAndRestart());
        expect(installAndRelaunchMock).not.toHaveBeenCalled();
    });

    it("reports a failed download on a manual check", async () => {
        fetchManifestMock.mockResolvedValue(newerManifest);
        downloadUpdateMock.mockRejectedValue(new Error("disk full"));
        const { result } = renderHook(() => useAutoUpdate());
        await act(() => result.current.checkNow());
        expect(result.current.state).toEqual({
            status: "error",
            message: "Couldn't download the update.",
        });
    });
});
