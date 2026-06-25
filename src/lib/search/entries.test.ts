import { describe, it, expect } from "vitest";
import { buildSearchEntries } from "./entries";
import type { Round } from "@/lib/model/types";

function makeRound(): Round {
    const now = 0;
    return {
        id: "r1",
        createdAt: now,
        updatedAt: now,
        role: "aff",
        format: {
            id: "f1",
            name: "Test",
            speeches: [
                { id: "1ac", name: "1AC", side: "aff", seconds: 0 },
                { id: "1nc", name: "1NC", side: "neg", seconds: 0 },
            ],
            prepSeconds: { aff: 0, neg: 0 },
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
        sheets: [
            {
                id: "s1",
                title: "Topicality",
                group: "neg",
                order: 0,
                kind: "flow",
            },
            { id: "s2", title: "Case", group: "aff", order: 1, kind: "flow" },
        ],
        nodes: [
            {
                id: "n1",
                sheetId: "s1",
                speechId: "1nc",
                parentId: null,
                order: 0,
                text: "Plan not topical",
                statuses: [],
                bold: false,
            },
            {
                id: "n2",
                sheetId: "s2",
                speechId: "1ac",
                parentId: null,
                order: 0,
                text: "Line one\nline two",
                statuses: [],
                bold: false,
            },
            {
                id: "n3",
                sheetId: "s2",
                speechId: "1ac",
                parentId: null,
                order: 1,
                text: "   ",
                statuses: [],
                bold: false,
            },
        ],
        groups: [],
    };
}

describe("buildSearchEntries", () => {
    it("returns empty structures for a null round", () => {
        const r = buildSearchEntries(null);
        expect(r).toEqual({
            sheetEntries: [],
            sheetHaystack: [],
            nodeEntries: [],
            nodeHaystack: [],
        });
    });

    it("builds sheet entries and a parallel title haystack", () => {
        const { sheetEntries, sheetHaystack } = buildSearchEntries(makeRound());
        expect(sheetEntries).toEqual([
            { sheetId: "s1", title: "Topicality" },
            { sheetId: "s2", title: "Case" },
        ]);
        expect(sheetHaystack).toEqual(["Topicality", "Case"]);
    });

    it("skips empty/whitespace-only nodes and collapses newlines", () => {
        const { nodeEntries, nodeHaystack } = buildSearchEntries(makeRound());
        expect(nodeEntries).toHaveLength(2);
        expect(nodeHaystack).toEqual(["Plan not topical", "Line one line two"]);
    });

    it("attaches sheet title and speech name to node entries", () => {
        const { nodeEntries } = buildSearchEntries(makeRound());
        expect(nodeEntries[0]).toMatchObject({
            nodeId: "n1",
            sheetId: "s1",
            speechId: "1nc",
            sheetTitle: "Topicality",
            speechName: "1NC",
        });
    });
});
