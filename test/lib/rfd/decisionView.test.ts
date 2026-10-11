import { describe, expect, it } from "vitest";

import { makeFlowRound, makeFlowSheet, type FlowRound } from "@/lib/model/flow";
import { decisionColumns, decisionPanels, decisionRows } from "@/lib/rfd/decisionView";

const shorts = (round: FlowRound, sheetIndex: number) =>
    decisionColumns(round, round.sheets[sheetIndex]).map(({ col }) => col.short);

describe("decisionColumns", () => {
    it("keeps only the 2NR and the 2AR of a Policy flow sheet, at their stored indices", () => {
        const round = makeFlowRound({});
        const aff = round.sheets.find((s) => s.kind !== "cx")!;
        // An aff sheet runs 1AC 1NC 2AC Block 1AR 2NR 2AR.
        expect(decisionColumns(round, aff).map(({ col, index }) => [col.short, index])).toEqual([
            ["2NR", 5],
            ["2AR", 6],
        ]);

        // A neg sheet starts at the 1NC, so the same speeches sit one column left.
        const neg = makeFlowSheet({ title: "T", group: "neg", order: 1 });
        round.sheets.push(neg);
        expect(decisionColumns(round, neg).map(({ index }) => index)).toEqual([4, 5]);
    });

    it("orders the final focuses by who speaks first in Public Forum", () => {
        const round = makeFlowRound({ event: "pf", firstSide: "neg" });
        expect(
            shorts(
                round,
                round.sheets.findIndex((s) => s.kind !== "cx"),
            ),
        ).toEqual(["NF", "AF"]);
    });

    it("takes the Opposition Block and the PMR as Parliamentary's last rebuttals", () => {
        const round = makeFlowRound({ event: "parli" });
        expect(shorts(round, 0)).toEqual(["Block", "PMR"]);
    });

    it("keeps every cross-ex period while the cross-ex sheet is empty", () => {
        const round = makeFlowRound({});
        const cx = round.sheets.findIndex((s) => s.kind === "cx");
        expect(decisionColumns(round, round.sheets[cx])).toHaveLength(8);
    });

    it("narrows the cross-ex sheet to the periods with text, each as its whole pair", () => {
        const round = makeFlowRound({});
        const cx = round.sheets.find((s) => s.kind === "cx")!;
        // Only the 2NC CX response (index 7) is written.
        cx.data = [[null, null, null, null, null, null, null, "it is a PIC"]];
        expect(
            decisionColumns(round, cx).map(({ col, index }) => [col.group, col.short, index]),
        ).toEqual([
            ["2NC CX", "Question", 6],
            ["2NC CX", "Response", 7],
        ]);
    });
});

describe("decisionRows", () => {
    it("closes up rows blank across the shown columns and keeps side-by-side text aligned", () => {
        const round = makeFlowRound({});
        const sheet = round.sheets.find((s) => s.kind !== "cx")!;
        sheet.data = [
            ["1ac only", null, null, null, null, null, null],
            [null, null, null, null, null, "", "  "],
            [null, null, null, null, null, "2nr line", "2ar answer"],
            [null, null, null, null, null, null, "2ar alone"],
        ];
        expect(decisionRows(sheet, decisionColumns(round, sheet))).toEqual([
            { row: 2, cells: ["2nr line", "2ar answer"] },
            { row: 3, cells: ["", "2ar alone"] },
        ]);
    });
});

describe("decisionPanels", () => {
    function round(): FlowRound {
        const r = makeFlowRound({});
        r.sheets.push(makeFlowSheet({ title: "K", group: "neg", order: 1 }));
        // The neg sheet's 2NR is index 4.
        r.sheets[2].data = [[null, null, null, null, "alt solves"]];
        return r;
    }

    it("shows a sheet with text in its columns and hides one without, in sheet order", () => {
        const r = round();
        const { shown, hidden } = decisionPanels(r, {});
        expect(shown.map((p) => p.sheet.title)).toEqual(["K"]);
        // The empty cross-ex sheet sorts first.
        expect(hidden.map((p) => p.sheet.title)).toEqual(["CX", "1."]);
    });

    it("lets a hand-made choice win over the default either way", () => {
        const r = round();
        const k = r.sheets[2].id;
        const first = r.sheets[1].id;
        const { shown, hidden } = decisionPanels(r, { [k]: false, [first]: true });
        expect(shown.map((p) => p.sheet.title)).toEqual(["1."]);
        expect(hidden.map((p) => p.sheet.title)).toEqual(["CX", "K"]);
    });

    it("leaves out a cross-ex sheet the round's event gives no periods", () => {
        // A round switched to Parliamentary keeps the cross-ex sheet it was
        // made with, but Parliamentary derives no columns for it.
        const r = makeFlowRound({});
        r.event = "parli";
        const { shown, hidden } = decisionPanels(r, { [r.sheets[0].id]: true });
        expect([...shown, ...hidden].map((p) => p.sheet.kind)).toEqual(["flow"]);
    });
});
