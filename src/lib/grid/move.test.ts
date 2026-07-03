import { describe, it, expect } from "vitest";

import type { ArgumentNode, Speech } from "@/lib/model/types";

import { isValidLinkTarget, linkSnapRow } from "./move";

function node(p: Partial<ArgumentNode> & { id: string; speechId: string }): ArgumentNode {
    return {
        sheetId: "sh",
        parentId: null,
        row: 0,
        text: "",
        statuses: [],
        bold: false,
        highlight: false,
        ...p,
    };
}

// ── Grab-to-link math ────────────────────────────────────────────────────────

const sp = (id: string, side: "aff" | "neg"): Speech => ({ id, name: id, side, seconds: 0 });
const linkSpeeches = [sp("1nc", "neg"), sp("2ac", "aff"), sp("1ar", "aff"), sp("2nr", "neg")];

describe("isValidLinkTarget", () => {
    // H is a unit in col 2 (1ar); P in col 1 (2ac); X in col 2.
    const nodes = [
        node({ id: "P", speechId: "2ac", row: 0 }),
        node({ id: "H", speechId: "1ar", row: 3 }),
        node({ id: "H2", speechId: "1ar", row: 4, unitId: "H" }),
        node({ id: "X", speechId: "1ar", row: 6 }),
        node({ id: "child", speechId: "2nr", row: 3, parentId: "H" }),
    ];

    it("accepts a strictly earlier column", () => {
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "P")).toBe(true);
    });
    it("rejects the same column", () => {
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "X")).toBe(false);
    });
    it("rejects the grabbed unit's own band (cycle)", () => {
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "child")).toBe(false);
        expect(isValidLinkTarget(nodes, linkSpeeches, "H", "H2")).toBe(false);
    });
    it("resolves a continuation target to a valid parent unit", () => {
        const withCont = [...nodes, node({ id: "P2", speechId: "2ac", row: 1, unitId: "P" })];
        expect(isValidLinkTarget(withCont, linkSpeeches, "H", "P2")).toBe(true);
    });
});

describe("linkSnapRow", () => {
    it("aligns beside the parent head when the parent has no answers in that column", () => {
        const nodes = [
            node({ id: "P", speechId: "2ac", row: 0 }),
            node({ id: "P2", speechId: "2ac", row: 1, unitId: "P" }),
            node({ id: "H", speechId: "1ar", row: 5 }),
        ];
        expect(linkSnapRow(nodes, "H", "P")).toBe(0);
    });

    it("stacks below the parent's existing answers in the linked column", () => {
        const nodes = [
            node({ id: "P", speechId: "2ac", row: 0 }),
            node({ id: "A1", speechId: "1ar", row: 0, parentId: "P" }),
            node({ id: "A1b", speechId: "1ar", row: 1, unitId: "A1" }),
            node({ id: "H", speechId: "1ar", row: 5 }),
        ];
        expect(linkSnapRow(nodes, "H", "P")).toBe(2);
    });
});
