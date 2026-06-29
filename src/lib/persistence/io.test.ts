import { describe, expect, it } from "vitest";

import { makeFormatByKey } from "@/lib/format/presets";
import { emptyScouting, normalizeRound } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

import { FILE_VERSION, exportRoundJSON, importRoundJSON } from "./io";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeRound(overrides: Partial<Round> = {}): Round {
    const now = Date.now();
    return {
        id: "round_test_001",
        createdAt: now,
        updatedAt: now,
        role: "aff",
        format: makeFormatByKey("policy"),
        scouting: emptyScouting(),
        sheets: [
            {
                id: "sheet_cx",
                title: "CX",
                group: "aff",
                order: -1,
                kind: "cx",
            },
            {
                id: "sheet_001",
                title: "Case",
                group: "aff",
                order: 0,
                kind: "flow",
            },
        ],
        groups: [],
        nodes: [
            {
                id: "node_001",
                sheetId: "sheet_001",
                speechId: "speech_001",
                parentId: null,
                row: 0,
                text: "Solvency",
                statuses: [],
                bold: false,
                highlight: false,
            },
        ],
        ...overrides,
    };
}

// ─── exportRoundJSON ──────────────────────────────────────────────────────────

describe("exportRoundJSON", () => {
    it("returns a string", () => {
        const round = makeRound();
        const json = exportRoundJSON(round);
        expect(typeof json).toBe("string");
    });

    it('exported string contains "version": 2', () => {
        const round = makeRound();
        const json = exportRoundJSON(round);
        expect(json).toContain('"version": 2');
    });

    it("includes the round id in the exported string", () => {
        const round = makeRound({ id: "round_export_test" });
        const json = exportRoundJSON(round);
        expect(json).toContain("round_export_test");
    });
});

// ─── importRoundJSON ──────────────────────────────────────────────────────────

describe("importRoundJSON", () => {
    it("round-trips: exportRoundJSON then importRoundJSON preserves structure (except identity)", () => {
        const round = makeRound();
        const json = exportRoundJSON(round);
        const imported = importRoundJSON(json);
        const normalized = normalizeRound(structuredClone(round));
        // Import assigns fresh identity, so verify structure is preserved
        expect(imported.role).toBe(normalized.role);
        expect(imported.format).toEqual(normalized.format);
        expect(imported.sheets).toEqual(normalized.sheets);
        expect(imported.nodes).toEqual(normalized.nodes);
        expect(imported.groups).toEqual(normalized.groups);
        expect(imported.scouting).toEqual(normalized.scouting);
        // Verify identity is fresh
        expect(imported.id).not.toBe(round.id);
        expect(imported.deletedAt).toBeNull();
    });

    it("preserves bold through export → import", () => {
        const round = makeRound({
            nodes: [
                {
                    id: "node_001",
                    sheetId: "sheet_001",
                    speechId: "speech_001",
                    parentId: null,
                    row: 0,
                    text: "Bold arg",
                    statuses: [],
                    bold: true,
                    highlight: true,
                },
            ],
        });
        const back = importRoundJSON(exportRoundJSON(round));
        expect(back.nodes[0].bold).toBe(true);
    });

    it("defaults bold to false for a node missing it (legacy file)", () => {
        const legacy = makeRound();
        const legacyNode = { ...legacy.nodes[0] };
        delete (legacyNode as { bold?: boolean }).bold;
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: { ...legacy, nodes: [legacyNode] },
        });
        const back = importRoundJSON(payload);
        expect(back.nodes[0].bold).toBe(false);
    });

    it('throws "Invalid JSON" on garbage input', () => {
        expect(() => importRoundJSON("not valid json {")).toThrow("Invalid JSON");
    });

    it('throws "Invalid JSON" on empty string', () => {
        expect(() => importRoundJSON("")).toThrow("Invalid JSON");
    });

    it('throws "Unsupported file version" when version is 3', () => {
        const payload = JSON.stringify({ version: 3, round: makeRound() });
        expect(() => importRoundJSON(payload)).toThrow("Unsupported file version: 3");
    });

    it('throws "Unsupported file version" when version is 0', () => {
        const payload = JSON.stringify({ version: 0, round: makeRound() });
        expect(() => importRoundJSON(payload)).toThrow("Unsupported file version: 0");
    });

    it('throws "Invalid round file" when round field is missing', () => {
        const payload = JSON.stringify({ version: FILE_VERSION });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when round is not an object', () => {
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: "string",
        });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when round.id is missing', () => {
        const { id: _id, ...roundNoId } = makeRound();
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: roundNoId,
        });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when round.role is missing', () => {
        const { role: _role, ...roundNoRole } = makeRound();
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: roundNoRole,
        });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when round.format is missing', () => {
        const { format: _format, ...roundNoFormat } = makeRound();
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: roundNoFormat,
        });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when round.sheets is not an array', () => {
        const round = makeRound();
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: { ...round, sheets: "bad" },
        });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when round.nodes is not an array', () => {
        const round = makeRound();
        const payload = JSON.stringify({
            version: FILE_VERSION,
            round: { ...round, nodes: null },
        });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it('throws "Invalid round file" when version field is not a number', () => {
        const payload = JSON.stringify({ version: "1", round: makeRound() });
        expect(() => importRoundJSON(payload)).toThrow("Invalid round file");
    });

    it("exports version 2", () => {
        expect(exportRoundJSON(makeRound())).toContain('"version": 2');
    });

    it("round-trips a rich round losslessly (except identity)", () => {
        const r = normalizeRound(
            makeRound({
                scouting: {
                    ...emptyScouting(),
                    tournament: "TOC",
                    judge: "Lee",
                    round: "Octos",
                },
                groups: [
                    {
                        id: "g1",
                        sheetId: "sheet_001",
                        label: "Bundle",
                        memberIds: ["node_001"],
                    },
                ],
                nodes: [
                    {
                        id: "node_001",
                        sheetId: "sheet_001",
                        speechId: "speech_001",
                        parentId: null,
                        row: 0,
                        text: "Solvency",
                        statuses: ["extended"],
                        bold: true,
                        highlight: true,
                        numberOverride: 4,
                    },
                ],
            }),
        );
        const back = importRoundJSON(exportRoundJSON(r));
        // Identity is freshened on import, so compare everything else
        expect(back.role).toBe(r.role);
        expect(back.format).toEqual(r.format);
        expect(back.sheets).toEqual(r.sheets);
        expect(back.nodes).toEqual(r.nodes);
        expect(back.groups).toEqual(r.groups);
        expect(back.scouting).toEqual(r.scouting);
        expect(back.deletedAt).toBeNull();
    });

    it("migrates a legacy v1 file, folding meta into scouting", () => {
        const v1 = JSON.stringify({
            version: 1,
            round: {
                ...makeRound(),
                meta: { tournament: "Old", judge: "J", roundLabel: "R3" },
            },
        });
        const r = importRoundJSON(v1);
        expect(r.scouting.tournament).toBe("Old");
        expect(r.scouting.judge).toBe("J");
        expect(r.scouting.round).toBe("R3");
    });
});

// ─── readRoundFile (browser helper) ──────────────────────────────────────────
// jsdom provides File and Blob polyfills; File.text() is available in jsdom.

describe("readRoundFile", () => {
    it("reads a File containing a valid exported round and returns a round with fresh identity", async () => {
        const { readRoundFile } = await import("./io");
        const round = makeRound({ id: "round_file_test" });
        const json = exportRoundJSON(round);
        const file = new File([json], "debate-flow-aff-20240101.json", {
            type: "application/json",
        });
        const imported = await readRoundFile(file);
        const normalized = normalizeRound(structuredClone(round));
        // Verify structure is preserved
        expect(imported.role).toBe(normalized.role);
        expect(imported.format).toEqual(normalized.format);
        expect(imported.sheets).toEqual(normalized.sheets);
        expect(imported.nodes).toEqual(normalized.nodes);
        // Verify identity is fresh
        expect(imported.id).not.toBe("round_file_test");
        expect(imported.deletedAt).toBeNull();
    });

    it("rejects when file contains invalid JSON", async () => {
        const { readRoundFile } = await import("./io");
        const file = new File(["garbage { not json"], "bad.json", {
            type: "application/json",
        });
        await expect(readRoundFile(file)).rejects.toThrow("Invalid JSON");
    });
});

// ─── importRoundJSON assigns fresh identity ────────────────────────────────────

describe("importRoundJSON assigns a fresh identity", () => {
    it("changes id, refreshes createdAt, clears deletedAt", () => {
        const original = {
            version: 2,
            round: {
                id: "orig-id",
                createdAt: 100,
                updatedAt: 100,
                deletedAt: 555,
                role: "aff",
                format: {
                    id: "f",
                    name: "T",
                    speeches: [],
                    prepSeconds: { aff: 240, neg: 240 },
                },
                scouting: {
                    aff: {
                        first: { first: "", last: "" },
                        second: { first: "", last: "" },
                    },
                    neg: {
                        first: { first: "", last: "" },
                        second: { first: "", last: "" },
                    },
                },
                sheets: [],
                nodes: [],
                groups: [],
            },
        };
        const r = importRoundJSON(JSON.stringify(original));
        expect(r.id).not.toBe("orig-id");
        expect(r.deletedAt ?? null).toBeNull();
    });
});
