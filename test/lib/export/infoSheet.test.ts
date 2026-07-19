import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { applyInfoWorksheet, maybeAddRfdWorksheet } from "@/lib/export/infoSheet";
import { makeFlowRound } from "@/lib/model/flow";

const roundWith = (patch: object) => {
    const round = makeFlowRound({ role: "judge" });
    Object.assign(round.scouting, patch);
    return round;
};

describe("applyInfoWorksheet", () => {
    it("writes scouting fields into the Info worksheet", () => {
        const wb = new ExcelJS.Workbook();
        const round = roundWith({
            tournament: "TOC",
            judge: "Judge Judy",
            affSchool: "Alpha HS",
            aff: {
                first: { first: "Ada", last: "L" },
                second: { first: "Ben", last: "M" },
            },
        });
        applyInfoWorksheet(wb, round);
        const ws = wb.getWorksheet("Info")!;
        expect(ws.getCell("B2").value).toBe("TOC");
        expect(ws.getCell("B5").value).toBe("Judge Judy");
        expect(ws.getCell("B7").value).toBe("Alpha HS");
        expect(ws.getCell("B8").value).toBe("Ada L");
        expect(ws.getCell("B9").value).toBe("Ben M");
    });
});

describe("maybeAddRfdWorksheet", () => {
    it("adds an RFD worksheet when a decision exists", () => {
        const wb = new ExcelJS.Workbook();
        const round = roundWith({ decision: { vote: "neg", rfd: "Dropped the disad." } });
        maybeAddRfdWorksheet(wb, round);
        const ws = wb.getWorksheet("RFD")!;
        expect(ws.getCell("B1").value).toBe("NEG");
        expect(ws.getCell("A2").value).toBe("Dropped the disad.");
    });

    it("skips the worksheet when there is no vote and no rfd", () => {
        const wb = new ExcelJS.Workbook();
        maybeAddRfdWorksheet(wb, makeFlowRound({ role: "aff" }));
        expect(wb.getWorksheet("RFD")).toBeUndefined();
    });
});
