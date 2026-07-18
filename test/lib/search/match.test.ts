import { describe, it, expect } from "vitest";

import { rank } from "@/lib/search/match";

interface Item {
    label: string;
    meta: string;
}

const noTie = () => 0;

function labels(items: Item[], query: string): string[] {
    return rank(
        items,
        query,
        (i) => i.label,
        (i) => i.meta,
        noTie,
    ).map((i) => i.label);
}

function item(label: string, meta = ""): Item {
    return { label, meta };
}

describe("rank", () => {
    it("returns everything in input order for an empty query", () => {
        const items = [item("b"), item("a"), item("c")];
        expect(labels(items, "")).toEqual(["b", "a", "c"]);
        expect(labels(items, "   ")).toEqual(["b", "a", "c"]);
    });

    it("requires every token to match somewhere (AND)", () => {
        const items = [item("warming da"), item("warming"), item("da")];
        expect(labels(items, "warming da")).toEqual(["warming da"]);
    });

    it("matches tokens in any order", () => {
        const items = [item("Warming DA")];
        expect(labels(items, "da warming")).toEqual(["Warming DA"]);
    });

    it("ranks exact over prefix over word-start over substring", () => {
        const items = [
            item("reundo stack"), // substring (mid-word)
            item("tree undo"), // word-start
            item("undo tree"), // prefix
            item("undo"), // exact
        ];
        expect(labels(items, "undo")).toEqual(["undo", "undo tree", "tree undo", "reundo stack"]);
    });

    it("ranks a secondary-only hit below every primary hit", () => {
        const items = [item("extend warming", "Case 2AC"), item("perm do both", "Warming 2AC")];
        expect(labels(items, "warming")).toEqual(["extend warming", "perm do both"]);
    });

    it("matches across primary and secondary fields together", () => {
        const items = [item("extend impact", "Warming 2AC"), item("extend impact", "Case 1AR")];
        expect(labels(items, "2ac impact")).toEqual(["extend impact"]);
        expect(
            rank(
                items,
                "2ac impact",
                (i) => i.label,
                (i) => i.meta,
                noTie,
            ),
        ).toEqual([items[0]]);
    });

    it("keeps input order within a tier under a no-op tiebreak", () => {
        const items = [item("undo b"), item("undo a")];
        expect(labels(items, "undo")).toEqual(["undo b", "undo a"]);
    });

    it("applies the tiebreak within tiers only", () => {
        const items = [item("zz undo"), item("undo"), item("aa undo")];
        const byLabel = (a: Item, b: Item) => a.label.localeCompare(b.label);
        const out = rank(
            items,
            "undo",
            (i) => i.label,
            (i) => i.meta,
            byLabel,
        );
        // Exact first regardless of alphabetical order, then the word-start tier sorted.
        expect(out.map((i) => i.label)).toEqual(["undo", "aa undo", "zz undo"]);
    });

    it("returns nothing when a token matches nowhere", () => {
        expect(labels([item("undo", "meta")], "zzz")).toEqual([]);
    });
});
