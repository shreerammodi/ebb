import { describe, it, expect } from "vitest";

import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

import { buildExportSheets } from "./cells";
import { DEFAULT_EXPORT_OPTIONS } from "./options";

function round(): Round {
    return {
        id: "r",
        createdAt: 0,
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
        scouting: emptyScouting(),
        sheets: [{ id: "sh", title: "T", group: "aff", order: 0 }],
        nodes: [
            {
                id: "p",
                sheetId: "sh",
                speechId: "s0",
                parentId: null,
                row: 0,
                text: "Root",
                statuses: [],
                bold: false,
            },
            {
                id: "c",
                sheetId: "sh",
                speechId: "s1",
                parentId: "p",
                row: 0,
                text: "Resp",
                statuses: ["conceded"],
                bold: false,
            },
        ],
        groups: [],
    };
}

describe("buildExportSheets", () => {
    it("produces placed cells with numbering prefix and decorations", () => {
        const [es] = buildExportSheets(round(), DEFAULT_EXPORT_OPTIONS);
        expect(es.sheet.title).toBe("T");
        const root = es.cells.find((c) => c.col === 0)!;
        expect(root.text).toBe("Root"); // roots are unnumbered
        expect(root.speechName).toBe("1AC");
        const resp = es.cells.find((c) => c.col === 1)!;
        expect(resp.text).toBe("1. Resp"); // response numbered within siblings
        expect(resp.crossed).toBe(true); // conceded -> crossed
        expect(resp.row).toBe(0);
    });

    it("omits numbering when autoNumber is off", () => {
        const [es] = buildExportSheets(round(), { autoNumber: false });
        expect(es.cells.find((c) => c.text === "Root")).toBeTruthy(); // no "1. " prefix
    });

    it("applies numbering when autoNumber is on", () => {
        const [es] = buildExportSheets(round(), { autoNumber: true });
        expect(es.cells.some((c) => c.text.startsWith("1. "))).toBe(true);
    });

    it("carries nodeId, rowSpan and bold on cells", () => {
        const [es] = buildExportSheets(round(), { autoNumber: true });
        const root = es.cells.find((c) => c.nodeId === "p");
        expect(root).toBeTruthy();
        expect(typeof root!.rowSpan).toBe("number");
        expect(root!.bold).toBe(false);
    });
});
