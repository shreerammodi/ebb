import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadUpdate, fetchManifest, installAndRelaunch, isDesktop } from "./adapter";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const checkMock = vi.mocked(check);
const relaunchMock = vi.mocked(relaunch);

describe("isDesktop", () => {
    afterEach(() => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        delete (window as Record<string, unknown>).__TAURI__;
    });

    it("is false in a plain browser (no Tauri globals)", () => {
        expect(isDesktop()).toBe(false);
    });

    it("is true when the Tauri internals global is present", () => {
        (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        expect(isDesktop()).toBe(true);
    });
});

describe("fetchManifest", () => {
    beforeEach(() => {
        (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });
    afterEach(() => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        vi.clearAllMocks();
    });

    const validRawJson = {
        version: "0.2.0",
        platforms: {
            "darwin-aarch64": { signature: "sig", url: "https://example.com/a" },
        },
    };

    it("returns the parsed manifest from the updater's rawJson", async () => {
        checkMock.mockResolvedValue({ rawJson: validRawJson } as never);
        const m = await fetchManifest();
        expect(m?.version).toBe("0.2.0");
    });

    it("returns null when no update is available (check resolves null)", async () => {
        checkMock.mockResolvedValue(null);
        expect(await fetchManifest()).toBeNull();
    });

    it("throws when the check fails, so callers can tell failure from up-to-date", async () => {
        checkMock.mockRejectedValue(new Error("offline"));
        await expect(fetchManifest()).rejects.toThrow();
    });

    it("throws on a malformed manifest", async () => {
        checkMock.mockResolvedValue({ rawJson: { nope: true } } as never);
        await expect(fetchManifest()).rejects.toThrow();
    });

    it("returns null off-desktop without hitting the updater", async () => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        expect(await fetchManifest()).toBeNull();
        expect(checkMock).not.toHaveBeenCalled();
    });
});

function makeUpdate(version: string) {
    return {
        version,
        download: vi.fn().mockResolvedValue(undefined),
        install: vi.fn().mockResolvedValue(undefined),
    };
}

describe("downloadUpdate", () => {
    beforeEach(() => {
        (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });
    afterEach(() => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        vi.clearAllMocks();
    });

    it("downloads the update but never installs (no disk rewrite)", async () => {
        const update = makeUpdate("0.3.5");
        checkMock.mockResolvedValue(update as never);
        const staged = await downloadUpdate();
        expect(staged?.version).toBe("0.3.5");
        expect(update.download).toHaveBeenCalledOnce();
        expect(update.install).not.toHaveBeenCalled();
    });

    it("returns null when no update is available", async () => {
        checkMock.mockResolvedValue(null);
        expect(await downloadUpdate()).toBeNull();
    });

    it("propagates download failures to the caller", async () => {
        const update = makeUpdate("0.3.5");
        update.download.mockRejectedValue(new Error("disk full"));
        checkMock.mockResolvedValue(update as never);
        await expect(downloadUpdate()).rejects.toThrow();
    });

    it("returns null off-desktop without hitting the updater", async () => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        expect(await downloadUpdate()).toBeNull();
        expect(checkMock).not.toHaveBeenCalled();
    });
});

describe("installAndRelaunch", () => {
    beforeEach(() => {
        (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });
    afterEach(() => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        vi.clearAllMocks();
    });

    it("installs the staged update, then relaunches", async () => {
        const order: string[] = [];
        const staged = {
            version: "0.3.5",
            install: vi.fn().mockImplementation(async () => order.push("install")),
        };
        relaunchMock.mockImplementation(async () => {
            order.push("relaunch");
        });
        await installAndRelaunch(staged);
        expect(order).toEqual(["install", "relaunch"]);
    });

    it("does not relaunch when the install fails", async () => {
        const staged = {
            version: "0.3.5",
            install: vi.fn().mockRejectedValue(new Error("swap failed")),
        };
        await expect(installAndRelaunch(staged)).rejects.toThrow();
        expect(relaunchMock).not.toHaveBeenCalled();
    });

    it("is a no-op off-desktop", async () => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        const staged = { version: "0.3.5", install: vi.fn() };
        await installAndRelaunch(staged);
        expect(staged.install).not.toHaveBeenCalled();
        expect(relaunchMock).not.toHaveBeenCalled();
    });
});
