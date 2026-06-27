import { describe, it, expect } from "vitest";

import {
    POLICY_PRESET,
    LD_PRESET,
    FORMAT_PRESETS,
    makeFormat,
    makeFormatByKey,
} from "@/lib/format/presets";

// ─── POLICY_PRESET ─────────────────────────────────────────────────────────

describe("POLICY_PRESET", () => {
    it("has 7 speeches", () => {
        expect(POLICY_PRESET.speeches).toHaveLength(7);
    });

    it("lists speeches in the exact order with correct names and sides", () => {
        const expected = [
            { name: "1AC", side: "aff" },
            { name: "1NC", side: "neg" },
            { name: "2AC", side: "aff" },
            { name: "Block", side: "neg" },
            { name: "1AR", side: "aff" },
            { name: "2NR", side: "neg" },
            { name: "2AR", side: "aff" },
        ];
        POLICY_PRESET.speeches.forEach((s, i) => {
            expect(s.name).toBe(expected[i].name);
            expect(s.side).toBe(expected[i].side);
        });
    });

    it("has correct seconds for each speech", () => {
        const expectedSeconds = [480, 480, 480, 780, 300, 300, 300];
        POLICY_PRESET.speeches.forEach((s, i) => {
            expect(s.seconds).toBe(expectedSeconds[i]);
        });
    });

    it("no speech has a group", () => {
        POLICY_PRESET.speeches.forEach((s) => {
            expect(s.group).toBeUndefined();
        });
    });

    it("has prepSeconds of 480 for both sides", () => {
        expect(POLICY_PRESET.prepSeconds.aff).toBe(480);
        expect(POLICY_PRESET.prepSeconds.neg).toBe(480);
    });

    it('has the name "Policy"', () => {
        expect(POLICY_PRESET.name).toBe("Policy");
    });
});

// ─── LD_PRESET ──────────────────────────────────────────────────────────────

describe("LD_PRESET", () => {
    it("has 5 speeches", () => {
        expect(LD_PRESET.speeches).toHaveLength(5);
    });

    it("lists speeches AC, NC, 1AR, NR, 2AR with correct sides", () => {
        const expected = [
            { name: "AC", side: "aff" },
            { name: "NC", side: "neg" },
            { name: "1AR", side: "aff" },
            { name: "NR", side: "neg" },
            { name: "2AR", side: "aff" },
        ];
        LD_PRESET.speeches.forEach((s, i) => {
            expect(s.name).toBe(expected[i].name);
            expect(s.side).toBe(expected[i].side);
        });
    });

    it("has correct seconds: 360, 420, 240, 360, 180", () => {
        const expectedSeconds = [360, 420, 240, 360, 180];
        LD_PRESET.speeches.forEach((s, i) => {
            expect(s.seconds).toBe(expectedSeconds[i]);
        });
    });

    it("has prepSeconds of 240 for both sides", () => {
        expect(LD_PRESET.prepSeconds.aff).toBe(240);
        expect(LD_PRESET.prepSeconds.neg).toBe(240);
    });

    it('has the name "Lincoln–Douglas"', () => {
        expect(LD_PRESET.name).toBe("Lincoln–Douglas");
    });
});

// ─── FORMAT_PRESETS list ────────────────────────────────────────────────────

describe("FORMAT_PRESETS", () => {
    it('contains a policy entry with key "policy" and label "Policy"', () => {
        const entry = FORMAT_PRESETS.find((p) => p.key === "policy");
        expect(entry).toBeDefined();
        expect(entry?.label).toBe("Policy");
        expect(entry?.preset).toBe(POLICY_PRESET);
    });

    it('contains an LD entry with key "ld" and label "Lincoln–Douglas"', () => {
        const entry = FORMAT_PRESETS.find((p) => p.key === "ld");
        expect(entry).toBeDefined();
        expect(entry?.label).toBe("Lincoln–Douglas");
        expect(entry?.preset).toBe(LD_PRESET);
    });

    it("has exactly 2 entries", () => {
        expect(FORMAT_PRESETS).toHaveLength(2);
    });
});

// ─── makeFormat ─────────────────────────────────────────────────────────────

describe("makeFormat", () => {
    it("returns a Format with the correct name from the preset", () => {
        const fmt = makeFormat(POLICY_PRESET);
        expect(fmt.name).toBe("Policy");
    });

    it("returns a Format with a fmt_ prefixed id", () => {
        const fmt = makeFormat(POLICY_PRESET);
        expect(fmt.id).toMatch(/^fmt_/);
    });

    it("returns a Format where every speech has a speech_ prefixed id", () => {
        const fmt = makeFormat(POLICY_PRESET);
        fmt.speeches.forEach((s) => {
            expect(s.id).toMatch(/^speech_/);
        });
    });

    it("all speech ids in a single format call are unique (no duplicates)", () => {
        const fmt = makeFormat(POLICY_PRESET);
        const ids = fmt.speeches.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("calling makeFormat twice produces different format ids", () => {
        const fmt1 = makeFormat(POLICY_PRESET);
        const fmt2 = makeFormat(POLICY_PRESET);
        expect(fmt1.id).not.toBe(fmt2.id);
    });

    it("calling makeFormat twice produces different speech ids", () => {
        const fmt1 = makeFormat(LD_PRESET);
        const fmt2 = makeFormat(LD_PRESET);
        const ids1 = fmt1.speeches.map((s) => s.id);
        const ids2 = fmt2.speeches.map((s) => s.id);
        // No id from fmt1 should appear in fmt2
        const overlap = ids1.filter((id) => ids2.includes(id));
        expect(overlap).toHaveLength(0);
    });

    it("preserves speech name, side, and seconds from the preset", () => {
        const fmt = makeFormat(POLICY_PRESET);
        const block = fmt.speeches.find((s) => s.name === "Block");
        expect(block?.side).toBe("neg");
        expect(block?.seconds).toBe(780);
        expect(block?.group).toBeUndefined();
    });

    it("preserves prepSeconds from the preset", () => {
        const fmt = makeFormat(LD_PRESET);
        expect(fmt.prepSeconds.aff).toBe(240);
        expect(fmt.prepSeconds.neg).toBe(240);
    });
});

// ─── makeFormatByKey ────────────────────────────────────────────────────────

describe("makeFormatByKey", () => {
    it('returns a Policy format for key "policy"', () => {
        const fmt = makeFormatByKey("policy");
        expect(fmt.name).toBe("Policy");
        expect(fmt.speeches).toHaveLength(7);
    });

    it('returns an LD format for key "ld"', () => {
        const fmt = makeFormatByKey("ld");
        expect(fmt.name).toBe("Lincoln–Douglas");
        expect(fmt.speeches).toHaveLength(5);
    });

    it("produces fresh ids on each call", () => {
        const fmt1 = makeFormatByKey("ld");
        const fmt2 = makeFormatByKey("ld");
        expect(fmt1.id).not.toBe(fmt2.id);
    });
});
