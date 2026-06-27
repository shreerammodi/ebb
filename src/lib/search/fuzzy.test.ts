import { describe, it, expect } from "vitest";

import { fuzzySearch, toSegments } from "./fuzzy";

const haystack = ["Plan not topical", "Case overview", "Topicality shell"];

describe("fuzzySearch", () => {
    it("returns empty result for a blank query", () => {
        expect(fuzzySearch(haystack, "   ")).toEqual({ order: [], ranges: [] });
    });

    it("ranks matches and returns haystack indices", () => {
        const { order } = fuzzySearch(haystack, "topical");
        expect(order.length).toBeGreaterThan(0);
        // "Plan not topical" and "Topicality shell" both match the subsequence.
        expect(order).toContain(0);
        expect(order).toContain(2);
        expect(order).not.toContain(1);
    });

    it("returns a ranges array aligned to order", () => {
        const { order, ranges } = fuzzySearch(haystack, "case");
        expect(order).toEqual([1]);
        expect(ranges).toHaveLength(1);
        expect(Array.isArray(ranges[0])).toBe(true);
    });
});

describe("toSegments", () => {
    it("returns a single unmatched segment when there are no ranges", () => {
        expect(toSegments("hello", [])).toEqual([{ text: "hello", match: false }]);
    });

    it("splits text into matched and unmatched segments", () => {
        // ranges are flat [start, end] pairs; mark "ell".
        expect(toSegments("hello", [1, 4])).toEqual([
            { text: "h", match: false },
            { text: "ell", match: true },
            { text: "o", match: false },
        ]);
    });
});
