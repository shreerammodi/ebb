import { describe, it, expect } from "vitest";
import { colIndexOf, occupantAt, maxRow, rippleDown, rippleUp } from "./coords";
import type { ArgumentNode, Speech } from "@/lib/model/types";

const sp = (id: string): Speech => ({ id, name: id, side: "aff", seconds: 0 });
const speeches = [sp("a"), sp("b"), sp("c")];

const n = (id: string, speechId: string, row: number): ArgumentNode => ({
    id,
    sheetId: "s1",
    speechId,
    parentId: null,
    row,
    text: id,
    statuses: [],
    bold: false,
    numberOverride: null,
});

describe("coords", () => {
    it("colIndexOf finds the column, −1 when absent", () => {
        expect(colIndexOf(speeches, "b")).toBe(1);
        expect(colIndexOf(speeches, "zzz")).toBe(-1);
    });

    it("occupantAt finds a node at a cell, scoped to sheet", () => {
        const nodes = [n("x", "a", 0), n("y", "a", 1)];
        expect(occupantAt(nodes, "s1", "a", 1)?.id).toBe("y");
        expect(occupantAt(nodes, "s1", "a", 2)).toBeNull();
        expect(occupantAt(nodes, "other", "a", 0)).toBeNull();
    });

    it("maxRow returns the highest row in the sheet, −1 when empty", () => {
        expect(maxRow([n("x", "a", 0), n("y", "c", 4)], "s1")).toBe(4);
        expect(maxRow([], "s1")).toBe(-1);
    });

    it("rippleDown shifts rows >= fromRow across all columns", () => {
        const nodes = [n("x", "a", 0), n("y", "b", 1), n("z", "a", 2)];
        const out = rippleDown(nodes, "s1", 1);
        expect(out.find((m) => m.id === "x")!.row).toBe(0);
        expect(out.find((m) => m.id === "y")!.row).toBe(2);
        expect(out.find((m) => m.id === "z")!.row).toBe(3);
    });

    it("rippleUp shifts rows >= fromRow up, leaving lower rows alone", () => {
        const nodes = [n("x", "a", 0), n("y", "b", 2), n("z", "a", 3)];
        const out = rippleUp(nodes, "s1", 2);
        expect(out.find((m) => m.id === "x")!.row).toBe(0);
        expect(out.find((m) => m.id === "y")!.row).toBe(1);
        expect(out.find((m) => m.id === "z")!.row).toBe(2);
    });

    it("ripple only touches the target sheet", () => {
        const nodes = [n("x", "a", 1), { ...n("o", "a", 1), sheetId: "s2" }];
        const out = rippleDown(nodes, "s1", 0);
        expect(out.find((m) => m.id === "x")!.row).toBe(2);
        expect(out.find((m) => m.id === "o")!.row).toBe(1);
    });
});
