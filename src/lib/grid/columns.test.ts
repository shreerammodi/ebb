import { describe, it, expect } from "vitest";

import { columnsForSheet } from "@/lib/grid/columns";
import type { Format, Sheet } from "@/lib/model/types";

const fmt = {
    speeches: [
        { id: "1ac", name: "1AC", side: "aff", seconds: 0 },
        { id: "1nc", name: "1NC", side: "neg", seconds: 0 },
        { id: "2ac", name: "2AC", side: "aff", seconds: 0 },
    ],
} as Format;

const sheet = (over: Partial<Sheet>): Sheet =>
    ({
        id: "s",
        title: "t",
        group: "neg",
        order: 0,
        kind: "flow",
        ...over,
    }) as Sheet;

describe("columnsForSheet", () => {
    it("returns speeches from startSpeechId onward", () => {
        expect(columnsForSheet(fmt, sheet({ startSpeechId: "1nc" })).map((s) => s.id)).toEqual([
            "1nc",
            "2ac",
        ]);
    });
    it("defaults a neg sheet to the first neg speech when startSpeechId is absent", () => {
        expect(columnsForSheet(fmt, sheet({ group: "neg" })).map((s) => s.id)).toEqual([
            "1nc",
            "2ac",
        ]);
    });
    it("defaults an aff sheet to all speeches", () => {
        expect(columnsForSheet(fmt, sheet({ group: "aff" })).map((s) => s.id)).toEqual([
            "1ac",
            "1nc",
            "2ac",
        ]);
    });
});
