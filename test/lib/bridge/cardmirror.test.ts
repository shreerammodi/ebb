import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cardmirrorReplace } from "@/lib/bridge/cardmirror";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invoked = vi.mocked(invoke);

beforeEach(() => {
    invoked.mockReset();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});

afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("cardmirrorReplace", () => {
    it("hands the token and the new text to the host", async () => {
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        const res = await cardmirrorReplace("cmsrc1.a", "The plan causes poverty.");

        expect(invoked).toHaveBeenCalledWith("cardmirror_replace", {
            source: "cmsrc1.a",
            text: "The plan causes poverty.",
        });
        expect(res).toEqual({ ok: true, value: expect.objectContaining({ ok: true }) });
    });

    it("surfaces the re-anchored token the reply carries", async () => {
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        const res = await cardmirrorReplace("cmsrc1.a", "next");

        expect(res.ok && res.value.source).toBe("cmsrc1.b");
    });

    it("leaves the token absent when the reply has none", async () => {
        invoked.mockResolvedValue({ ok: false, error: "doc-readonly" });

        const res = await cardmirrorReplace("cmsrc1.a", "next");

        expect(res.ok && res.value.source).toBeUndefined();
        expect(res.ok && res.value.error).toBe("doc-readonly");
    });

    it("drops a token that is not a string rather than passing it on", async () => {
        invoked.mockResolvedValue({ ok: true, source: 17 });

        const res = await cardmirrorReplace("cmsrc1.a", "next");

        expect(res.ok && res.value.source).toBeUndefined();
    });

    it("answers unsupported on the web build without invoking anything", async () => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

        const res = await cardmirrorReplace("cmsrc1.a", "next");

        expect(res).toEqual({ ok: false, error: "unsupported" });
        expect(invoked).not.toHaveBeenCalled();
    });
});
