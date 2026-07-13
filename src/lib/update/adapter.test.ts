import { check } from "@tauri-apps/plugin-updater";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchManifest, isDesktop } from "./adapter";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

const checkMock = vi.mocked(check);

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

    it("returns null when the check throws (silent failure)", async () => {
        checkMock.mockRejectedValue(new Error("offline"));
        expect(await fetchManifest()).toBeNull();
    });

    it("returns null on a malformed manifest", async () => {
        checkMock.mockResolvedValue({ rawJson: { nope: true } } as never);
        expect(await fetchManifest()).toBeNull();
    });

    it("returns null off-desktop without hitting the updater", async () => {
        delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
        expect(await fetchManifest()).toBeNull();
        expect(checkMock).not.toHaveBeenCalled();
    });
});
