import { describe, expect, it } from "vitest";

import type { ArgumentNode } from "@/lib/model/types";
import {
    detachFromUnit,
    deleteUnitSubtree,
    isUnitHead,
    joinWithAbove,
    lastMemberRow,
    removeNodeWithPromotion,
    splitAt,
    unitBandBottom,
    unitHeadOf,
    unitKeyOf,
    unitOf,
    unitSubtreeIds,
} from "@/lib/model/units";

function node(partial: Partial<ArgumentNode> & { id: string }): ArgumentNode {
    return {
        sheetId: "s1",
        speechId: "1nc",
        parentId: null,
        row: 0,
        text: "x",
        statuses: [],
        bold: false,
        highlight: false,
        numberOverride: null,
        ...partial,
    };
}

// A 3-cell unit (a,b,c keyed by "a") with one response unit (r1,r2 keyed by
// "r1") answering the head, plus an unrelated single-cell node z below.
const fixture: ArgumentNode[] = [
    node({ id: "a", row: 0 }),
    node({ id: "b", row: 1, unitId: "a" }),
    node({ id: "c", row: 2, unitId: "a" }),
    node({ id: "r1", speechId: "2ac", row: 0, parentId: "a" }),
    node({ id: "r2", speechId: "2ac", row: 1, unitId: "r1" }),
    node({ id: "z", row: 5 }),
];
const byId = (nodes: ArgumentNode[], id: string) => nodes.find((n) => n.id === id)!;

describe("unit identity", () => {
    it("absent unitId means self-unit", () => {
        expect(unitKeyOf(byId(fixture, "z"))).toBe("z");
        expect(unitKeyOf(byId(fixture, "b"))).toBe("a");
    });

    it("unitOf returns members ascending by row", () => {
        expect(unitOf(fixture, byId(fixture, "c")).map((n) => n.id)).toEqual(["a", "b", "c"]);
        expect(unitOf(fixture, byId(fixture, "z")).map((n) => n.id)).toEqual(["z"]);
    });

    it("head is the lowest-row member", () => {
        expect(unitHeadOf(fixture, byId(fixture, "c")).id).toBe("a");
        expect(isUnitHead(fixture, byId(fixture, "a"))).toBe(true);
        expect(isUnitHead(fixture, byId(fixture, "b"))).toBe(false);
    });

    it("lastMemberRow is the deepest member cell", () => {
        expect(lastMemberRow(fixture, byId(fixture, "b"))).toBe(2);
    });
});

describe("unitSubtreeIds", () => {
    it("closes over members, their responses, and those responses' members", () => {
        expect(unitSubtreeIds(fixture, "b")).toEqual(new Set(["a", "b", "c", "r1", "r2"]));
    });

    it("a response unit's subtree excludes its parent", () => {
        expect(unitSubtreeIds(fixture, "r2")).toEqual(new Set(["r1", "r2"]));
    });
});

describe("unitBandBottom", () => {
    it("covers member cells and the whole response band", () => {
        expect(unitBandBottom(fixture, byId(fixture, "a"))).toBe(2);
    });

    it("a single-cell unit with a taller response band extends past its cell", () => {
        const nodes = [
            node({ id: "p", row: 0 }),
            node({ id: "x1", speechId: "2ac", row: 0, parentId: "p" }),
            node({ id: "x2", speechId: "2ac", row: 1, unitId: "x1" }),
            node({ id: "x3", speechId: "2ac", row: 2, unitId: "x1" }),
        ];
        expect(unitBandBottom(nodes, byId(nodes, "p"))).toBe(2);
    });
});

describe("joinWithAbove", () => {
    it("absorbs the unit into the adjacent unit above, re-parenting responses", () => {
        const nodes = [
            node({ id: "u", row: 0 }),
            node({ id: "v", row: 1, parentId: null }),
            node({ id: "w", row: 2, unitId: "v" }),
            node({ id: "ans", speechId: "2ac", row: 1, parentId: "v" }),
        ];
        const joined = joinWithAbove(nodes, "w");
        expect(unitOf(joined, byId(joined, "u")).map((n) => n.id)).toEqual(["u", "v", "w"]);
        // v's response now answers the surviving head u
        expect(byId(joined, "ans").parentId).toBe("u");
        expect(byId(joined, "v").parentId).toBeNull();
    });

    it("no-ops (same reference) when no cell sits directly above the head", () => {
        expect(joinWithAbove(fixture, "z")).toBe(fixture);
    });
});

describe("splitAt", () => {
    it("cell and below become a new parentless unit", () => {
        const split = splitAt(fixture, "b");
        expect(unitOf(split, byId(split, "a")).map((n) => n.id)).toEqual(["a"]);
        expect(unitOf(split, byId(split, "b")).map((n) => n.id)).toEqual(["b", "c"]);
        expect(byId(split, "b").parentId).toBeNull();
    });

    it("no-ops (same reference) on a head", () => {
        expect(splitAt(fixture, "a")).toBe(fixture);
    });
});

describe("detachFromUnit", () => {
    it("re-keys the remaining members when the key-anchor head leaves", () => {
        const detached = detachFromUnit(fixture, "a");
        expect(unitOf(detached, byId(detached, "a")).map((n) => n.id)).toEqual(["a"]);
        expect(unitOf(detached, byId(detached, "b")).map((n) => n.id)).toEqual(["b", "c"]);
    });

    it("no-ops (same reference) on a single-cell unit", () => {
        expect(detachFromUnit(fixture, "z")).toBe(fixture);
    });
});

describe("removeNodeWithPromotion", () => {
    it("promotes the next member to head, keeping links intact", () => {
        const removed = removeNodeWithPromotion(fixture, "a");
        expect(removed.find((n) => n.id === "a")).toBeUndefined();
        // b is the new head; a's response now answers b
        expect(byId(removed, "r1").parentId).toBe("b");
        expect(unitHeadOf(removed, byId(removed, "c")).id).toBe("b");
    });

    it("falls back to orphan semantics for a single-cell unit", () => {
        const nodes = [
            node({ id: "p", row: 0 }),
            node({ id: "k", speechId: "2ac", row: 0, parentId: "p" }),
        ];
        const removed = removeNodeWithPromotion(nodes, "p");
        expect(byId(removed, "k").parentId).toBeNull();
    });
});

describe("deleteUnitSubtree", () => {
    it("deletes every member and every response in the band", () => {
        const left = deleteUnitSubtree(fixture, "b");
        expect(left.map((n) => n.id)).toEqual(["z"]);
    });
});
