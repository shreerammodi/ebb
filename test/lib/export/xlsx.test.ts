import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { fillWorkbook } from "@/lib/export/xlsx";
import { makeFlowRound } from "@/lib/model/flow";

function judgedRound() {
    const round = makeFlowRound({ role: "judge" });
    round.scouting.decision = { vote: "aff", rfd: "Won on topicality." };
    const flow = round.sheets.find((s) => s.kind !== "cx")!;
    flow.title = "1. Topicality";
    flow.data = [
        ["We meet", null],
        [null, "Counter-interp"],
    ];
    flow.meta = {
        "0,0": { bold: true, highlight: true },
        "1,1": { card: true, group: true },
    };
    return round;
}

describe("fillWorkbook", () => {
    it("orders worksheets Info, RFD, cross-ex, then flow sheets by ebb order", () => {
        const wb = new ExcelJS.Workbook();
        fillWorkbook(wb, judgedRound());
        expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Info", "RFD", "CX", "1. Topicality"]);
    });

    it("freezes the header row, hides gridlines, and widens columns", () => {
        const wb = new ExcelJS.Workbook();
        fillWorkbook(wb, judgedRound());
        const flow = wb.getWorksheet("1. Topicality")!;
        expect(flow.views[0]).toMatchObject({
            showGridLines: false,
            state: "frozen",
            ySplit: 1,
        });
        expect(flow.getColumn(1).width).toBeGreaterThanOrEqual(30);
        // Cross-ex keeps both header tiers (period + column labels) frozen.
        expect(wb.getWorksheet("CX")!.views[0]).toMatchObject({ ySplit: 2 });
        expect(wb.getWorksheet("Info")!.views[0]).toMatchObject({ showGridLines: false });
    });

    it("writes speech titles in row 1 with side-colored ink and no protection", () => {
        const wb = new ExcelJS.Workbook();
        fillWorkbook(wb, judgedRound());
        const flow = wb.getWorksheet("1. Topicality")!;
        const header = flow.getCell(1, 1);
        expect(header.value).toBe("1AC");
        expect(header.font).toMatchObject({ bold: true, color: { argb: "FF1D4ED8" } });
        expect(header.alignment).toMatchObject({ horizontal: "center" });
        expect(flow.sheetProtection?.sheet).toBeFalsy();
        expect(flow.properties.tabColor).toEqual({ argb: "FF1D4ED8" });
        expect(wb.getWorksheet("CX")!.properties.tabColor).toBeUndefined();
    });

    it("carries cell text and decorations into body cells under the header", () => {
        const wb = new ExcelJS.Workbook();
        fillWorkbook(wb, judgedRound());
        const flow = wb.getWorksheet("1. Topicality")!;
        const highlighted = flow.getCell(2, 1);
        expect(highlighted.value).toBe("We meet");
        expect(highlighted.font).toMatchObject({ bold: true });
        expect(highlighted.fill).toMatchObject({ fgColor: { argb: "FFFDE047" } });
        const marked = flow.getCell(3, 2);
        expect(marked.value).toBe("Counter-interp");
        expect(marked.border?.bottom).toMatchObject({ color: { argb: "FF2563EB" } });
        expect(marked.border?.left).toMatchObject({ color: { argb: "FF6B7280" } });
        // Plain cells carry no fill, so worksheets keep Excel's default white.
        expect(flow.getCell(2, 2).fill ?? {}).not.toHaveProperty("fgColor");
    });
});
