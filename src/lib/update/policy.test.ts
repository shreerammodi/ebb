import { describe, expect, it } from "vitest";

import {
    decideUpdateAction,
    isNewerVersion,
    isUpdateEligible,
    parseManifest,
    shouldPromptCritical,
} from "./policy";
import { DEFAULT_UPDATE_CONFIG, type UpdateConfig, type UpdateManifest } from "./types";

const TOURNAMENT_ON: UpdateConfig = { ...DEFAULT_UPDATE_CONFIG, tournamentMode: true };

describe("isUpdateEligible", () => {
    it("is eligible with Tournament Mode off", () => {
        expect(isUpdateEligible(DEFAULT_UPDATE_CONFIG)).toBe(true);
    });

    it("is not eligible when Tournament Mode is on", () => {
        expect(isUpdateEligible(TOURNAMENT_ON)).toBe(false);
    });
});

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

    it("preserves the critical flag when present and boolean", () => {
        expect(parseManifest({ ...valid, critical: true }).critical).toBe(true);
        expect(parseManifest({ ...valid, critical: false }).critical).toBe(false);
    });

    it("defaults critical to undefined when absent", () => {
        expect(parseManifest(valid).critical).toBeUndefined();
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

describe("shouldPromptCritical", () => {
    const criticalManifest = { version: "0.2.1", critical: true, platforms: {} };
    const normalManifest = { version: "0.2.1", platforms: {} };

    it("prompts when a critical update is held by Tournament Mode", () => {
        expect(shouldPromptCritical(criticalManifest, TOURNAMENT_ON)).toBe(true);
    });

    it("does not prompt when the update is already eligible (normal flow applies)", () => {
        expect(shouldPromptCritical(criticalManifest, DEFAULT_UPDATE_CONFIG)).toBe(false);
    });

    it("does not prompt for a non-critical update held by Tournament Mode", () => {
        expect(shouldPromptCritical(normalManifest, TOURNAMENT_ON)).toBe(false);
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
        const action = decideUpdateAction(
            manifest({ version: "0.1.0" }),
            "0.1.0",
            DEFAULT_UPDATE_CONFIG,
        );
        expect(action.kind).toBe("none");
    });

    it("downloads when newer and eligible", () => {
        const action = decideUpdateAction(manifest(), "0.1.0", DEFAULT_UPDATE_CONFIG);
        expect(action.kind).toBe("download");
    });

    it("holds when newer but Tournament Mode is on and not critical", () => {
        const action = decideUpdateAction(manifest(), "0.1.0", TOURNAMENT_ON);
        expect(action.kind).toBe("hold");
    });

    it("prompts critical when newer, critical, and held by Tournament Mode", () => {
        const action = decideUpdateAction(manifest({ critical: true }), "0.1.0", TOURNAMENT_ON);
        expect(action.kind).toBe("critical");
    });

    it("downloads a critical update normally when already eligible", () => {
        const action = decideUpdateAction(
            manifest({ critical: true }),
            "0.1.0",
            DEFAULT_UPDATE_CONFIG,
        );
        expect(action.kind).toBe("download");
    });
});
