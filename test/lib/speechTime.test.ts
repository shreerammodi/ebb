import { describe, expect, it } from "vitest";

import { makeFlowRound, makeFlowSheet } from "@/lib/model/flow";
import { speechDuration, speechWordCount } from "@/lib/speechTime";

describe("speechWordCount", () => {
    it("counts the same speech across flow sheets", () => {
        const round = makeFlowRound();
        round.sheets[1].data = [[null, null, "one  two"]];
        const neg = makeFlowSheet({ title: "2.", group: "neg", order: 1 });
        neg.data = [[null, "three\nfour"]];
        round.sheets.push(neg);

        expect(speechWordCount(round, "2ac")).toBe(4);
    });

    it("ignores blank cells and speeches absent from a sheet", () => {
        const round = makeFlowRound();
        round.sheets[1].data = [["  "], [null], ["one"]];
        expect(speechWordCount(round, "1ac")).toBe(1);
        expect(speechWordCount(round, "missing")).toBe(0);
    });
});

describe("speechDuration", () => {
    it("rounds partial seconds up and formats minutes", () => {
        expect(speechDuration(0, 150)).toBe("0:00");
        expect(speechDuration(1, 150)).toBe("0:01");
        expect(speechDuration(342, 150)).toBe("2:17");
    });
});
