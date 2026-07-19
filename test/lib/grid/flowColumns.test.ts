import { describe, expect, it } from "vitest";

import { EVENTS } from "@/lib/format/events";
import { columnsForFlowSheet, crossExColumns, headerSettings } from "@/lib/grid/flowColumns";
import { makeCxFlowSheet, makeFlowRound, makeFlowSheet } from "@/lib/model/flow";

const flowSheet = (group: "aff" | "neg") => makeFlowSheet({ title: "1.", group, order: 0 });

describe("columnsForFlowSheet", () => {
    it("policy aff sheets show all seven speeches", () => {
        const round = makeFlowRound({ role: "aff" });
        expect(columnsForFlowSheet(round, flowSheet("aff")).map((c) => c.name)).toEqual([
            "1AC",
            "1NC",
            "2AC",
            "Block",
            "1AR",
            "2NR",
            "2AR",
        ]);
    });

    it("policy neg sheets start at the 1NC", () => {
        const round = makeFlowRound({ role: "neg" });
        const cols = columnsForFlowSheet(round, flowSheet("neg"));
        expect(cols[0].id).toBe("1nc");
        expect(cols).toHaveLength(6);
    });

    it("pf gives the first-speaking side 8 columns and the other side 7", () => {
        const affFirst = makeFlowRound({ role: "aff", event: "pf", firstSide: "aff" });
        expect(columnsForFlowSheet(affFirst, flowSheet("aff"))).toHaveLength(8);
        expect(columnsForFlowSheet(affFirst, flowSheet("neg"))).toHaveLength(7);

        const negFirst = makeFlowRound({ role: "aff", event: "pf", firstSide: "neg" });
        expect(columnsForFlowSheet(negFirst, flowSheet("neg"))).toHaveLength(8);
        expect(columnsForFlowSheet(negFirst, flowSheet("aff"))).toHaveLength(7);
        expect(columnsForFlowSheet(negFirst, flowSheet("neg"))[0].short).toBe("NC");
    });

    it("an explicit startSpeechId wins; unknown ids fall back to the full order", () => {
        const round = makeFlowRound({ role: "aff" });
        const sheet = { ...flowSheet("aff"), startSpeechId: "2ac" };
        expect(columnsForFlowSheet(round, sheet)[0].id).toBe("2ac");
        const bogus = { ...sheet, startSpeechId: "nope" };
        expect(columnsForFlowSheet(round, bogus)).toHaveLength(7);
    });

    it("legacy policy startSpeechId values still resolve", () => {
        const round = makeFlowRound({ role: "neg" });
        const sheet = { ...flowSheet("neg"), startSpeechId: "1nc" };
        expect(columnsForFlowSheet(round, sheet)[0].id).toBe("1nc");
    });

    it("cx sheets derive periods from the event", () => {
        const policy = makeFlowRound({ role: "aff" });
        const policyCols = columnsForFlowSheet(policy, makeCxFlowSheet());
        expect(policyCols).toHaveLength(8);
        expect(policyCols[0]).toMatchObject({ name: "Question", side: "neg", group: "1AC CX" });

        const pf = makeFlowRound({ role: "aff", event: "pf", firstSide: "neg" });
        const pfCols = columnsForFlowSheet(pf, makeCxFlowSheet("Cross-Examination"));
        expect(pfCols).toHaveLength(6);
        expect(pfCols.map((c) => c.group)).toEqual([
            "First Cross",
            "First Cross",
            "Second Cross",
            "Second Cross",
            "Grand Cross",
            "Grand Cross",
        ]);
        expect(pfCols[0].side).toBe("neg");
    });

    it("pf crossfire columns are labelled by side; policy stays Question/Response", () => {
        const pf = makeFlowRound({ role: "aff", event: "pf", firstSide: "aff" });
        const pfCols = columnsForFlowSheet(pf, makeCxFlowSheet("Cross-Examination"));
        expect(pfCols.slice(0, 2)).toMatchObject([
            { name: "Aff", short: "Aff", side: "aff" },
            { name: "Neg", short: "Neg", side: "neg" },
        ]);

        const policy = makeFlowRound({ role: "aff" });
        const policyCols = columnsForFlowSheet(policy, makeCxFlowSheet());
        expect(policyCols[0]).toMatchObject({ name: "Question", side: "neg" });
    });
});

describe("headerSettings", () => {
    it("flow sheets use short header labels", () => {
        const round = makeFlowRound({ role: "aff", event: "pf" });
        const sheet = flowSheet("aff");
        const cols = columnsForFlowSheet(round, sheet);
        expect(headerSettings(sheet, cols).colHeaders).toEqual([
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

    it("pads overflow columns past the derived set with blank labels", () => {
        const round = makeFlowRound({ role: "aff", event: "pf" });
        const sheet = flowSheet("aff");
        const cols = columnsForFlowSheet(round, sheet);
        const headers = headerSettings(sheet, cols, cols.length + 2).colHeaders as string[];
        expect(headers).toHaveLength(cols.length + 2);
        expect(headers.slice(cols.length)).toEqual(["", ""]);
    });

    it("cx sheets get a period tier above Question/Response", () => {
        const round = makeFlowRound({ role: "aff" });
        const sheet = makeCxFlowSheet();
        const cols = columnsForFlowSheet(round, sheet);
        const settings = headerSettings(sheet, cols);
        expect(settings.colHeaders).toBe(true);
        expect(settings.nestedHeaders?.[0]).toEqual([
            { label: "1AC CX", colspan: 2 },
            { label: "1NC CX", colspan: 2 },
            { label: "2AC CX", colspan: 2 },
            { label: "2NC CX", colspan: 2 },
        ]);
    });
});
