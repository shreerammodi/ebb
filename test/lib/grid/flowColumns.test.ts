import { describe, expect, it } from "vitest";

import { columnsForFlowSheet, CX_FLOW_COLUMNS, POLICY_COLUMNS } from "@/lib/grid/flowColumns";
import { makeCxFlowSheet, makeFlowSheet } from "@/lib/model/flow";

describe("columnsForFlowSheet", () => {
    it("aff sheets show all seven speeches", () => {
        const sheet = makeFlowSheet({ title: "Aff", group: "aff", order: 0 });
        expect(columnsForFlowSheet(sheet).map((c) => c.name)).toEqual([
            "1AC",
            "1NC",
            "2AC",
            "Block",
            "1AR",
            "2NR",
            "2AR",
        ]);
    });

    it("neg sheets start at the 1NC", () => {
        const sheet = makeFlowSheet({ title: "Neg", group: "neg", order: 0 });
        expect(columnsForFlowSheet(sheet)[0].id).toBe("1nc");
        expect(columnsForFlowSheet(sheet)).toHaveLength(6);
    });

    it("an explicit startSpeechId wins; unknown ids fall back to the full list", () => {
        const sheet = {
            ...makeFlowSheet({ title: "X", group: "aff", order: 0 }),
            startSpeechId: "2ac",
        };
        expect(columnsForFlowSheet(sheet)[0].id).toBe("2ac");
        const bogus = { ...sheet, startSpeechId: "nope" };
        expect(columnsForFlowSheet(bogus)).toEqual(POLICY_COLUMNS);
    });

    it("cx sheets use the fixed CX column set", () => {
        expect(columnsForFlowSheet(makeCxFlowSheet())).toBe(CX_FLOW_COLUMNS);
        expect(CX_FLOW_COLUMNS).toHaveLength(8);
        expect(CX_FLOW_COLUMNS[0]).toMatchObject({
            id: "cx-1ac-q",
            name: "Question",
            group: "1AC CX",
        });
    });
});
