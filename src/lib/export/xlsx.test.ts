import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx } from "./xlsx";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";
import { DEFAULT_EXPORT_OPTIONS } from "./options";

const template = new Uint8Array(
    readFileSync(resolve(process.cwd(), "public/templates/Flow.xlsx")),
);

function round(): Round {
    return {
        id: "r",
        createdAt: Date.UTC(2026, 5, 2),
        updatedAt: 0,
        role: "aff",
        format: {
            id: "f",
            name: "Policy",
            prepSeconds: { aff: 0, neg: 0 },
            speeches: [
                { id: "s0", name: "1AC", side: "aff", seconds: 0 },
                { id: "s1", name: "1NC", side: "neg", seconds: 0 },
            ],
        },
        scouting: { ...emptyScouting(), tournament: "States", round: "R3" },
        sheets: [{ id: "sh", title: "Politics DA", group: "aff", order: 0 }],
        nodes: [
            {
                id: "p",
                sheetId: "sh",
                speechId: "s0",
                parentId: null,
                order: 0,
                text: "Uniqueness",
                statuses: [],
                bold: false,
            },
        ],
        groups: [],
    };
}

describe("buildXlsx", () => {
    it("writes CX question/response nodes into the CX sheet", () => {
        const r = round();
        // Ensure a CX sheet exists
        if (!r.sheets.some((s) => s.kind === "cx")) {
            r.sheets.push({
                id: "cx",
                title: "CX",
                group: "aff",
                order: -1,
                kind: "cx",
            });
        }
        const cxId = r.sheets.find((s) => s.kind === "cx")!.id;
        r.nodes.push(
            {
                id: "q1",
                sheetId: cxId,
                speechId: "cx-1ac-q",
                parentId: null,
                order: 0,
                text: "Why plan?",
                statuses: [],
                bold: false,
            },
            {
                id: "r1",
                sheetId: cxId,
                speechId: "cx-1ac-r",
                parentId: "q1",
                order: 0,
                text: "Because.",
                statuses: [],
                bold: false,
            },
        );
        const bytes = buildXlsx(r, template, DEFAULT_EXPORT_OPTIONS);
        const files = unzipSync(bytes);
        const cxXml = Object.keys(files)
            .filter((k) => k.startsWith("xl/worksheets/"))
            .map((k) => strFromU8(files[k]))
            .join("");
        expect(cxXml).toContain("Why plan?");
        expect(cxXml).toContain("Because.");
    });

    it("produces a valid zip with a populated sheet and patched Info", () => {
        const bytes = buildXlsx(round(), template, DEFAULT_EXPORT_OPTIONS);
        const files = unzipSync(bytes);

        // calcChain dropped.
        expect(files["xl/calcChain.xml"]).toBeUndefined();
        // Content type stays as standard xlsx.
        expect(strFromU8(files["[Content_Types].xml"])).toContain(
            "spreadsheetml.sheet.main+xml",
        );
        // New worksheet exists and contains the node text + sheet title.
        const newSheet = strFromU8(files["xl/worksheets/sheet6.xml"]);
        expect(newSheet).toContain("Uniqueness");
        expect(newSheet).toContain("Politics DA");
        // Workbook registers the new tab name.
        expect(strFromU8(files["xl/workbook.xml"])).toContain("Politics DA");
        // calcChain relationship removed from rels — no dangling reference.
        expect(strFromU8(files["xl/_rels/workbook.xml.rels"])).not.toContain(
            "calcChain",
        );
        // No duplicate xr:uid on the cloned sheet — prevents Excel corruption.
        expect(newSheet).not.toContain("xr:uid=");
        // Body cells carry the column style index from the template.
        expect(newSheet).toContain('s="35"');
    });

    it("emits a well-formed workbook.xml root tag", () => {
        const bytes = buildXlsx(round(), template, DEFAULT_EXPORT_OPTIONS);
        const workbookXml = strFromU8(unzipSync(bytes)["xl/workbook.xml"]);
        // The <workbook> start tag must be closed with ">" before any child element.
        const startTag = workbookXml.match(/<workbook\b[^>]*>/)?.[0] ?? "";
        expect(startTag).not.toBe("");
        expect(startTag).not.toContain("<fileVersion");
        // No xr: prefixed attribute — xmlns:xr is not declared on the rebuilt root.
        expect(startTag).not.toContain("xr:");
        // First child element appears outside the start tag.
        expect(workbookXml).toContain("><fileVersion");
    });

    it("produces case-insensitively unique sheet names and never duplicates the CX tab", () => {
        const r = round();
        // A dedicated CX sheet (written into the template CX sheet, not appended as a flow tab).
        r.sheets.push({
            id: "cx",
            title: "CX",
            group: "aff",
            order: -1,
            kind: "cx",
        });
        // A flow sheet whose title collides case-insensitively with the hidden "AFF" scaffolding.
        r.sheets.push({ id: "a2", title: "Aff", group: "aff", order: 1 });

        const wb = strFromU8(
            unzipSync(buildXlsx(r, template, DEFAULT_EXPORT_OPTIONS))[
                "xl/workbook.xml"
            ],
        );
        const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) =>
            m[1].toLowerCase(),
        );

        // Every tab name is unique (Excel treats names case-insensitively).
        expect(new Set(names).size).toBe(names.length);
        // CX appears exactly once — the dedicated CX sheet, not also appended as a flow tab.
        expect(names.filter((n) => n === "cx")).toHaveLength(1);
    });

    it("sanitizes illegal characters and the 31-char limit in appended tab names", () => {
        const r = round();
        r.sheets = [
            {
                id: "sh",
                title: "Plan: T/L [Politics] *DA* — a very very long title here",
                group: "aff",
                order: 0,
            },
        ];
        r.nodes = [
            {
                id: "p",
                sheetId: "sh",
                speechId: "s0",
                parentId: null,
                order: 0,
                text: "x",
                statuses: [],
                bold: false,
            },
        ];
        const wb = strFromU8(
            unzipSync(buildXlsx(r, template, DEFAULT_EXPORT_OPTIONS))[
                "xl/workbook.xml"
            ],
        );
        const appended = [...wb.matchAll(/<sheet name="([^"]*)"/g)]
            .map((m) => m[1])
            .find(
                (n) => !["Info", "AFF", "NEG", "Decisions", "CX"].includes(n),
            )!;
        expect(appended.length).toBeLessThanOrEqual(31);
        expect(appended).not.toMatch(/[:\\/?*\[\]]/);
    });

    it("writes scouting fields into the Info sheet", () => {
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
        const bytes = buildXlsx(r, template, DEFAULT_EXPORT_OPTIONS);
        const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
        expect(xml).toContain("Westwood");
        expect(xml).toContain("Lincoln");
        expect(xml).toContain("Smith");
        expect(xml).toContain("Clear on impacts.");
    });

    it("writes scouting tournament and judge into the Info sheet", () => {
        const r = round();
        r.scouting = {
            ...emptyScouting(),
            tournament: "TOC",
            judge: "Lee",
        };
        const bytes = buildXlsx(r, template, DEFAULT_EXPORT_OPTIONS);
        // Info is sheet1.xml in the Flow.xlsx template
        const info = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
        expect(info).toContain("TOC");
        expect(info).toContain("Lee");
    });

    it("includes numbering prefixes when autoNumber is on", () => {
        const r = round();
        // Add a parent node in speech s0 and two child nodes so they get numbered 1. / 2.
        r.nodes = [
            {
                id: "parent",
                sheetId: "sh",
                speechId: "s0",
                parentId: null,
                order: 0,
                text: "Uniqueness",
                statuses: [],
                bold: false,
            },
            {
                id: "child1",
                sheetId: "sh",
                speechId: "s1",
                parentId: "parent",
                order: 0,
                text: "NonUnique",
                statuses: [],
                bold: false,
            },
            {
                id: "child2",
                sheetId: "sh",
                speechId: "s1",
                parentId: "parent",
                order: 1,
                text: "TurnCase",
                statuses: [],
                bold: false,
            },
        ];
        const bytes = buildXlsx(r, template, { autoNumber: true });
        const files = unzipSync(bytes);
        // The generated flow sheet is the last appended worksheet
        const flowXml = Object.keys(files)
            .filter(
                (k) =>
                    k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml"),
            )
            .map((k) => strFromU8(files[k]))
            .join("\n");
        // Child nodes should have "1. " and "2. " prefixes embedded in inline string cells
        expect(flowXml).toMatch(/>1\. NonUnique</);
        expect(flowXml).toMatch(/>2\. TurnCase</);
    });

    it("omits numbering prefixes when autoNumber is off", () => {
        const r = round();
        r.nodes = [
            {
                id: "parent",
                sheetId: "sh",
                speechId: "s0",
                parentId: null,
                order: 0,
                text: "Uniqueness",
                statuses: [],
                bold: false,
            },
            {
                id: "child1",
                sheetId: "sh",
                speechId: "s1",
                parentId: "parent",
                order: 0,
                text: "NonUnique",
                statuses: [],
                bold: false,
            },
            {
                id: "child2",
                sheetId: "sh",
                speechId: "s1",
                parentId: "parent",
                order: 1,
                text: "TurnCase",
                statuses: [],
                bold: false,
            },
        ];
        const bytes = buildXlsx(r, template, { autoNumber: false });
        const files = unzipSync(bytes);
        const flowXml = Object.keys(files)
            .filter(
                (k) =>
                    k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml"),
            )
            .map((k) => strFromU8(files[k]))
            .join("\n");
        // No "N. " numbering prefix should appear before the node texts
        expect(flowXml).not.toMatch(/>1\. NonUnique</);
        expect(flowXml).not.toMatch(/>2\. TurnCase</);
        // The raw text should still appear (without prefix)
        expect(flowXml).toContain("NonUnique");
        expect(flowXml).toContain("TurnCase");
    });
});
