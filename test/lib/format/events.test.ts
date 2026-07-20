import { describe, expect, it } from "vitest";

import { EVENTS, getEvent, speechOrder } from "@/lib/format/events";

describe("getEvent", () => {
    it("defaults to policy when the id is absent", () => {
        expect(getEvent(undefined).id).toBe("policy");
        expect(getEvent("pf").id).toBe("pf");
    });
});

describe("speechOrder", () => {
    it("policy aff-first reproduces the classic 7-speech order", () => {
        expect(speechOrder(EVENTS.policy, "aff").map((s) => s.name)).toEqual([
            "1AC",
            "1NC",
            "2AC",
            "Block",
            "1AR",
            "2NR",
            "2AR",
        ]);
    });

    it("pf aff-first alternates aff/neg across all 8 speeches", () => {
        expect(speechOrder(EVENTS.pf, "aff").map((s) => s.short)).toEqual([
            "AC",
            "NC",
            "AR",
            "NR",
            "AS",
            "NS",
            "AF",
            "NF",
        ]);
    });

    it("pf neg-first leads with the neg speeches", () => {
        expect(speechOrder(EVENTS.pf, "neg").map((s) => s.short)).toEqual([
            "NC",
            "AC",
            "NR",
            "AR",
            "NS",
            "AS",
            "NF",
            "AF",
        ]);
    });

    it("ld aff-first interleaves down to the 2AR", () => {
        expect(speechOrder(EVENTS.ld, "aff").map((s) => s.short)).toEqual([
            "1AC",
            "1NC",
            "1AR",
            "2NR",
            "2AR",
        ]);
    });

    it("pf speeches carry descriptive names and sides", () => {
        const ac = EVENTS.pf.aff[0];
        expect(ac).toMatchObject({
            id: "ac",
            name: "Aff Constructive",
            short: "AC",
            side: "aff",
        });
        expect(EVENTS.pf.neg.map((s) => s.id)).toEqual(["nc", "nr", "ns", "nf"]);
    });

    it("cross-examination configs differ per event", () => {
        expect(EVENTS.policy.crossEx.title).toBe("CX");
        expect(EVENTS.policy.crossEx.periods).toHaveLength(4);
        expect(EVENTS.pf.crossEx.title).toBe("Cross-Examination");
        expect(EVENTS.pf.crossEx.periods.map((p) => p.label)).toEqual([
            "First Cross",
            "Second Cross",
            "Grand Cross",
        ]);
        expect(EVENTS.pf.crossEx.periods.every((p) => p.q === "first")).toBe(true);
        expect(EVENTS.ld.crossEx.periods).toEqual([
            { label: "1AC CX", q: "second" },
            { label: "1NC CX", q: "first" },
        ]);
    });
});
