import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchManifest, isDesktop } from "./adapter";

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
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const validBody = {
        version: "0.2.0",
        platforms: {
            "darwin-aarch64": { signature: "sig", url: "https://example.com/a" },
        },
    };

    it("returns the parsed manifest on a successful fetch", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(validBody),
            }),
        );
        const m = await fetchManifest();
        expect(m?.version).toBe("0.2.0");
    });

    it("returns null on a non-ok response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }),
        );
        expect(await fetchManifest()).toBeNull();
    });

    it("returns null when the network throws (silent failure)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        expect(await fetchManifest()).toBeNull();
    });

    it("returns null on a malformed manifest", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ nope: true }),
            }),
        );
        expect(await fetchManifest()).toBeNull();
    });
});
