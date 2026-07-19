import { describe, expect, it } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";
import {
    exportFlowBackupJSON,
    exportFlowJSON,
    importFlowJSON,
    parseFlowImportFile,
} from "@/lib/persistence/flowIo";

describe("flowIo", () => {
    it("round-trips a round with a fresh identity", () => {
        const r = makeFlowRound({ role: "aff" });
        const flow = r.sheets.find((s) => s.kind !== "cx")!;
        flow.data = [["hello", null]];
        flow.meta = { "0,0": { bold: true } };
        const imported = importFlowJSON(exportFlowJSON(r));
        expect(imported.id).not.toBe(r.id);
        expect(imported.deletedAt).toBeNull();
        expect(imported.sheets.find((s) => s.kind !== "cx")?.data).toEqual([["hello", null]]);
        expect(imported.sheets.find((s) => s.kind !== "cx")?.meta).toEqual({
            "0,0": { bold: true },
        });
    });

    it("rejects legacy and invalid files", () => {
        expect(() => importFlowJSON("not json")).toThrow("Invalid JSON");
        expect(() => importFlowJSON(JSON.stringify({ version: 2, round: {} }))).toThrow(
            "Unsupported file version: 2",
        );
        expect(() =>
            importFlowJSON(JSON.stringify({ version: 3, round: { id: "x", role: "aff" } })),
        ).toThrow("Invalid round file");
        expect(() =>
            importFlowJSON(
                JSON.stringify({
                    version: 3,
                    round: { id: "x", role: "aff", sheets: [{ id: "s", title: "t" }] },
                }),
            ),
        ).toThrow("Invalid round file");
    });

    it("parses both single and backup envelopes with fresh ids", () => {
        const a = makeFlowRound({ role: "aff" });
        const b = makeFlowRound({ role: "neg" });
        const fromBackup = parseFlowImportFile(exportFlowBackupJSON([a, b]));
        expect(fromBackup).toHaveLength(2);
        expect(fromBackup.map((r) => r.id)).not.toContain(a.id);
        const fromSingle = parseFlowImportFile(exportFlowJSON(a));
        expect(fromSingle).toHaveLength(1);
    });
});
