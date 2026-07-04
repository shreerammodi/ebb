import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { unzipSync, strFromU8 } from "fflate";
import { describe, it, expect } from "vitest";

import { emptyScouting, makeFlowRound, type FlowRound } from "@/lib/model/flow";

import { buildXlsx } from "./xlsx";

const template = new Uint8Array(readFileSync(resolve(process.cwd(), "public/templates/Flow.xlsx")));

/** An aff round whose flow sheet is titled "Politics DA" with one 1AC cell. */
function round(): FlowRound {
    const r = makeFlowRound("aff");
    r.createdAt = Date.UTC(2026, 5, 2);
    r.scouting = { ...emptyScouting(), tournament: "States", round: "R3" };
    const flow = r.sheets.find((s) => s.kind !== "cx")!;
    flow.title = "Politics DA";
    flow.data = [["Uniqueness"]];
    return r;
}

describe("buildXlsx", () => {
    it("writes CX question/response cells into the CX worksheet", () => {
        const r = round();
        const cx = r.sheets.find((s) => s.kind === "cx")!;
        cx.data = [["Why plan?", "Because.", null, null, null, null, null, null]];
        const bytes = buildXlsx(r, template);
        const files = unzipSync(bytes);
        const cxXml = Object.keys(files)
            .filter((k) => k.startsWith("xl/worksheets/"))
            .map((k) => strFromU8(files[k]))
            .join("");
        expect(cxXml).toContain("Why plan?");
        expect(cxXml).toContain("Because.");
    });

    it("produces a valid zip with a populated worksheet and patched Info", () => {
        const bytes = buildXlsx(round(), template);
        const files = unzipSync(bytes);

        // calcChain dropped.
        expect(files["xl/calcChain.xml"]).toBeUndefined();
        // Content type stays as standard xlsx.
        expect(strFromU8(files["[Content_Types].xml"])).toContain("spreadsheetml.sheet.main+xml");
        // New worksheet exists and contains the cell text + sheet title.
        const newSheet = strFromU8(files["xl/worksheets/sheet6.xml"]);
        expect(newSheet).toContain("Uniqueness");
        expect(newSheet).toContain("Politics DA");
        // Workbook registers the new tab name.
        expect(strFromU8(files["xl/workbook.xml"])).toContain("Politics DA");
        // calcChain relationship removed from rels - no dangling reference.
        expect(strFromU8(files["xl/_rels/workbook.xml.rels"])).not.toContain("calcChain");
        // No duplicate xr:uid on the cloned sheet - prevents Excel corruption.
        expect(newSheet).not.toContain("xr:uid=");
        // Body cells carry the column style index from the template.
        expect(newSheet).toContain('s="35"');
    });

    it("emits a well-formed workbook.xml root tag", () => {
        const bytes = buildXlsx(round(), template);
        const workbookXml = strFromU8(unzipSync(bytes)["xl/workbook.xml"]);
        // The <workbook> start tag must be closed with ">" before any child element.
        const startTag = workbookXml.match(/<workbook\b[^>]*>/)?.[0] ?? "";
        expect(startTag).not.toBe("");
        expect(startTag).not.toContain("<fileVersion");
        // No xr: prefixed attribute - xmlns:xr is not declared on the rebuilt root.
        expect(startTag).not.toContain("xr:");
        // First child element appears outside the start tag.
        expect(workbookXml).toContain("><fileVersion");
    });

    it("produces case-insensitively unique sheet names and never duplicates the CX tab", () => {
        const r = round();
        // A flow sheet whose title collides case-insensitively with the hidden "AFF" scaffolding.
        r.sheets.push({
            id: "a2",
            title: "Aff",
            group: "aff",
            order: 1,
            kind: "flow",
            data: [],
            meta: {},
        });

        const wb = strFromU8(unzipSync(buildXlsx(r, template))["xl/workbook.xml"]);
        const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1].toLowerCase());

        // Every tab name is unique (Excel treats names case-insensitively).
        expect(new Set(names).size).toBe(names.length);
        // CX appears exactly once - the dedicated CX worksheet, not also a flow tab.
        expect(names.filter((n) => n === "cx")).toHaveLength(1);
    });

    it("sanitizes illegal characters and the 31-char limit in appended tab names", () => {
        const r = round();
        const flow = r.sheets.find((s) => s.kind !== "cx")!;
        flow.title = "Plan: T/L [Politics] *DA* -- a very very long title here";
        flow.data = [["x"]];
        const wb = strFromU8(unzipSync(buildXlsx(r, template))["xl/workbook.xml"]);
        const appended = [...wb.matchAll(/<sheet name="([^"]*)"/g)]
            .map((m) => m[1])
            .find((n) => !["Info", "AFF", "NEG", "Decisions", "CX"].includes(n))!;
        expect(appended.length).toBeLessThanOrEqual(31);
        expect(appended).not.toMatch(/[:\\/?*\[\]]/);
    });

    it("writes scouting fields into the Info worksheet", () => {
        const r = round();
        r.scouting = {
            affSchool: "Westwood",
            negSchool: "Lincoln",
            aff: {
                first: { first: "Al", last: "Smith" },
                second: { first: "Bo", last: "Jones" },
            },
            neg: {
                first: { first: "Cy", last: "Diaz" },
                second: { first: "Di", last: "Eaton" },
            },
            tournament: "Berkeley",
            round: "3",
            date: "2026-06-03",
            judge: "Pat Lee",
            decision: { vote: "aff", rfd: "Clear on impacts." },
        };
        const bytes = buildXlsx(r, template);
        const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
        expect(xml).toContain("Westwood");
        expect(xml).toContain("Lincoln");
        expect(xml).toContain("Smith");
        expect(xml).toContain("Clear on impacts.");
    });

    it("carries bold cell meta through without a numbering prefix", () => {
        const r = round();
        const flow = r.sheets.find((s) => s.kind !== "cx")!;
        flow.data = [["Uniqueness", "NonUnique"]];
        flow.meta = { "0,0": { bold: true } };
        const files = unzipSync(buildXlsx(r, template));
        const flowXml = Object.keys(files)
            .filter((k) => k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml"))
            .map((k) => strFromU8(files[k]))
            .join("\n");
        expect(flowXml).toContain("Uniqueness");
        expect(flowXml).toContain("NonUnique");
        expect(flowXml).not.toMatch(/>1\. /);
    });
});
