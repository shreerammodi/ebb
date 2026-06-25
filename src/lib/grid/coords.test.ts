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

import {
    spawnTarget,
    placeForSpawn,
    descendantIds,
    translateSubtree,
} from "./coords";

describe("spawn placement", () => {
    it("sibling targets next row, same column", () => {
        const nodes = [n("p", "a", 0)];
        const t = spawnTarget(nodes, "s1", speeches, nodes[0], "sibling");
        expect(t).toEqual({ speechId: "a", row: 1 });
    });

    it("response targets same row, next column", () => {
        const nodes = [n("p", "a", 0)];
        const t = spawnTarget(nodes, "s1", speeches, nodes[0], "response");
        expect(t).toEqual({ speechId: "b", row: 0 });
    });

    it("response off the last column is null", () => {
        const nodes = [n("p", "c", 0)];
        expect(spawnTarget(nodes, "s1", speeches, nodes[0], "response")).toBeNull();
    });

    it("placeForSpawn ripples when the sibling row is occupied", () => {
        // contentions at a:0,1,2 ; first response already at b:0
        const nodes = [
            n("c1", "a", 0),
            n("c2", "a", 1),
            n("c3", "a", 2),
            n("r1", "b", 0),
        ];
        const res = placeForSpawn(nodes, "s1", speeches, nodes[3], "sibling")!;
        expect({ speechId: res.speechId, row: res.row }).toEqual({
            speechId: "b",
            row: 1,
        });
        // c2 and c3 rippled down to keep alignment
        expect(res.nodes.find((m) => m.id === "c2")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "c3")!.row).toBe(3);
    });

    it("placeForSpawn does NOT ripple when the target cell is free", () => {
        const nodes = [n("p", "a", 0)];
        const res = placeForSpawn(nodes, "s1", speeches, nodes[0], "response")!;
        expect({ speechId: res.speechId, row: res.row }).toEqual({
            speechId: "b",
            row: 0,
        });
        expect(res.nodes).toEqual(nodes); // untouched
    });
});

describe("subtree", () => {
    it("descendantIds collects root + transitive children", () => {
        const nodes = [
            n("root", "a", 0),
            { ...n("c", "b", 0), parentId: "root" },
            { ...n("gc", "c", 0), parentId: "c" },
            n("other", "a", 1),
        ];
        expect(descendantIds(nodes, "root")).toEqual(
            new Set(["root", "c", "gc"]),
        );
    });

    it("translateSubtree shifts the whole subtree by delta", () => {
        const nodes = [
            n("root", "a", 0),
            { ...n("c", "b", 0), parentId: "root" },
        ];
        const res = translateSubtree(nodes, speeches, "root", 0, 2);
        expect(res.ok).toBe(true);
        expect(res.nodes.find((m) => m.id === "root")!.row).toBe(2);
        expect(res.nodes.find((m) => m.id === "c")!.row).toBe(2);
    });

    it("translateSubtree rejects a collision with a non-subtree node", () => {
        const nodes = [n("root", "a", 0), n("blocker", "a", 2)];
        const res = translateSubtree(nodes, speeches, "root", 0, 2);
        expect(res.ok).toBe(false);
        expect(res.nodes).toEqual(nodes);
    });

    it("translateSubtree rejects moving out of column bounds", () => {
        const nodes = [n("root", "c", 0)];
        const res = translateSubtree(nodes, speeches, "root", 1, 0);
        expect(res.ok).toBe(false);
    });
});
