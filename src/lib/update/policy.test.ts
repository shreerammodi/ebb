import { describe, expect, it } from "vitest";

import {
    decideUpdateAction,
    isInBlackout,
    isNewerVersion,
    isUpdateEligible,
    parseManifest,
    shouldPromptCritical,
} from "./policy";
import {
    DEFAULT_UPDATE_CONFIG,
    type UpdateConfig,
    type UpdateManifest,
} from "./types";

// June 2026 is a convenient reference week. Using the local Date constructor
// (year, monthIndex, day) yields a stable local weekday regardless of the test
// runner's timezone, which matches the design's "local time" rule.
//   Jun 5 = Fri, Jun 6 = Sat, Jun 7 = Sun, Jun 8 = Mon,
//   Jun 9 = Tue, Jun 10 = Wed, Jun 11 = Thu, Jun 12 = Fri
const FRI = new Date(2026, 5, 5);
const SAT = new Date(2026, 5, 6);
const SUN = new Date(2026, 5, 7);
const MON = new Date(2026, 5, 8);
const TUE = new Date(2026, 5, 9);
const WED = new Date(2026, 5, 10);
const THU = new Date(2026, 5, 11);

describe("isInBlackout", () => {
    it("treats the default Friday–Monday window (wrapping the week) as blackout", () => {
        for (const d of [FRI, SAT, SUN, MON]) {
            expect(isInBlackout(d, DEFAULT_UPDATE_CONFIG)).toBe(true);
        }
    });

    it("treats midweek days as outside the default blackout", () => {
        for (const d of [TUE, WED, THU]) {
            expect(isInBlackout(d, DEFAULT_UPDATE_CONFIG)).toBe(false);
        }
    });

    it("handles a non-wrapping window (Tue–Thu) inclusively", () => {
        const config: UpdateConfig = {
            ...DEFAULT_UPDATE_CONFIG,
            blackoutStartDay: 2,
            blackoutEndDay: 4,
        };
        expect(isInBlackout(TUE, config)).toBe(true);
        expect(isInBlackout(WED, config)).toBe(true);
        expect(isInBlackout(THU, config)).toBe(true);
        expect(isInBlackout(MON, config)).toBe(false);
        expect(isInBlackout(FRI, config)).toBe(false);
    });

    it("handles a single-day window (start === end)", () => {
        const config: UpdateConfig = {
            ...DEFAULT_UPDATE_CONFIG,
            blackoutStartDay: 3,
            blackoutEndDay: 3,
        };
        expect(isInBlackout(WED, config)).toBe(true);
        expect(isInBlackout(TUE, config)).toBe(false);
        expect(isInBlackout(THU, config)).toBe(false);
    });

    it("includes both boundary days of a wrapping window", () => {
        // start=Fri(5), end=Mon(1): Friday and Monday are both inside.
        expect(isInBlackout(FRI, DEFAULT_UPDATE_CONFIG)).toBe(true);
        expect(isInBlackout(MON, DEFAULT_UPDATE_CONFIG)).toBe(true);
        // Tuesday is the first day outside.
        expect(isInBlackout(TUE, DEFAULT_UPDATE_CONFIG)).toBe(false);
    });
});

describe("isUpdateEligible", () => {
    it("is eligible outside the blackout with tournament mode off", () => {
        expect(
            isUpdateEligible({ now: TUE, config: DEFAULT_UPDATE_CONFIG }),
        ).toBe(true);
    });

    it("is not eligible inside the blackout", () => {
        expect(
            isUpdateEligible({ now: FRI, config: DEFAULT_UPDATE_CONFIG }),
        ).toBe(false);
    });

    it("is not eligible when tournament mode is on, even midweek", () => {
        const config: UpdateConfig = {
            ...DEFAULT_UPDATE_CONFIG,
            tournamentMode: true,
        };
        expect(isUpdateEligible({ now: TUE, config })).toBe(false);
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

    it("prompts when a critical update is held by the blackout", () => {
        expect(
            shouldPromptCritical(criticalManifest, {
                now: FRI,
                config: DEFAULT_UPDATE_CONFIG,
            }),
        ).toBe(true);
    });

    it("prompts when a critical update is held by tournament mode", () => {
        const config: UpdateConfig = {
            ...DEFAULT_UPDATE_CONFIG,
            tournamentMode: true,
        };
        expect(
            shouldPromptCritical(criticalManifest, { now: TUE, config }),
        ).toBe(true);
    });

    it("does not prompt when the update is already eligible (normal flow applies)", () => {
        expect(
            shouldPromptCritical(criticalManifest, {
                now: TUE,
                config: DEFAULT_UPDATE_CONFIG,
            }),
        ).toBe(false);
    });

    it("does not prompt for a non-critical update held by the blackout", () => {
        expect(
            shouldPromptCritical(normalManifest, {
                now: FRI,
                config: DEFAULT_UPDATE_CONFIG,
            }),
        ).toBe(false);
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
        const action = decideUpdateAction(manifest({ version: "0.1.0" }), "0.1.0", {
            now: TUE,
            config: DEFAULT_UPDATE_CONFIG,
        });
        expect(action.kind).toBe("none");
    });

    it("downloads when newer and eligible", () => {
        const action = decideUpdateAction(manifest(), "0.1.0", {
            now: TUE,
            config: DEFAULT_UPDATE_CONFIG,
        });
        expect(action.kind).toBe("download");
    });

    it("holds when newer but inside the blackout and not critical", () => {
        const action = decideUpdateAction(manifest(), "0.1.0", {
            now: FRI,
            config: DEFAULT_UPDATE_CONFIG,
        });
        expect(action.kind).toBe("hold");
    });

    it("prompts critical when newer, critical, and held by the blackout", () => {
        const action = decideUpdateAction(manifest({ critical: true }), "0.1.0", {
            now: FRI,
            config: DEFAULT_UPDATE_CONFIG,
        });
        expect(action.kind).toBe("critical");
    });

    it("downloads a critical update normally when already eligible", () => {
        const action = decideUpdateAction(manifest({ critical: true }), "0.1.0", {
            now: TUE,
            config: DEFAULT_UPDATE_CONFIG,
        });
        expect(action.kind).toBe("download");
    });
});
