import { describe, expect, it } from "vitest";

import { decideUpdateAction, isNewerVersion, parseManifest } from "./policy";
import { type UpdateManifest } from "./types";

describe("parseManifest", () => {
    const valid = {
        version: "0.2.0",
        pub_date: "2026-06-09T12:00:00Z",
        notes: "Bug fixes",
        platforms: {
            "darwin-aarch64": { signature: "sig", url: "https://example.com/app" },
        },
    };

    it("parses a valid manifest and preserves fields", () => {
        const m = parseManifest(valid);
        expect(m.version).toBe("0.2.0");
        expect(m.pub_date).toBe("2026-06-09T12:00:00Z");
        expect(m.notes).toBe("Bug fixes");
        expect(m.platforms["darwin-aarch64"]?.url).toBe("https://example.com/app");
    });

    it("throws when version is missing", () => {
        const { version: _omit, ...noVersion } = valid;
        expect(() => parseManifest(noVersion)).toThrow();
    });

    it("throws when platforms is missing", () => {
        const { platforms: _omit, ...noPlatforms } = valid;
        expect(() => parseManifest(noPlatforms)).toThrow();
    });

    it("throws on a non-object input", () => {
        expect(() => parseManifest(null)).toThrow();
        expect(() => parseManifest("nope")).toThrow();
    });
});

describe("isNewerVersion", () => {
    it("compares numeric components", () => {
        expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
        expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
        expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    });

    it("is false for equal or older versions", () => {
        expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
        expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
    });

    it("tolerates a leading v and differing lengths", () => {
        expect(isNewerVersion("v1.0.1", "1.0")).toBe(true);
        expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
    });
});

describe("decideUpdateAction", () => {
    const manifest = (over: Partial<UpdateManifest> = {}): UpdateManifest => ({
        version: "0.2.0",
        platforms: {},
        ...over,
    });

    it("does nothing when the manifest is not newer", () => {
        expect(decideUpdateAction(manifest({ version: "0.1.0" }), "0.1.0").kind).toBe("none");
    });

    it("downloads when newer", () => {
        expect(decideUpdateAction(manifest(), "0.1.0").kind).toBe("download");
    });
});
