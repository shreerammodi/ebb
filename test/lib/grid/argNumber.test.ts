import { describe, expect, it } from "vitest";

import {
    argMarkerLength,
    DEFAULT_ARG_MARKER,
    formatArgMarker,
    nextArgNumber,
} from "@/lib/grid/argNumber";

describe("formatArgMarker", () => {
    it("fills both tokens in the default template", () => {
        expect(formatArgMarker(DEFAULT_ARG_MARKER, "2AC", 3)).toBe("2AC #3 ");
    });

    it("falls back to the default when the template is empty", () => {
        expect(formatArgMarker("  ", "1NC", 1)).toBe("1NC #1 ");
    });

    it("matches tokens in any case", () => {
        expect(formatArgMarker("%number%. ", "2AC", 2)).toBe("2. ");
    });

    it("writes the template's own separator and nothing more", () => {
        expect(formatArgMarker("%Speech% #%Number%---", "2AC", 1)).toBe("2AC #1---");
    });

    it("appends the number to a template that has none", () => {
        expect(formatArgMarker("%Speech%-", "2AC", 4)).toBe("2AC-4");
    });
});

describe("argMarkerLength", () => {
    it("measures a marker at the head of the text", () => {
        expect(argMarkerLength("2AC #1 no link", DEFAULT_ARG_MARKER, "2AC")).toBe(7);
        expect(argMarkerLength("2AC #12---perm", "%Speech% #%Number%---", "2AC")).toBe(10);
    });

    it("is 0 for text that does not open with a marker", () => {
        expect(argMarkerLength("no link 2AC #1", DEFAULT_ARG_MARKER, "2AC")).toBe(0);
    });
});

describe("nextArgNumber", () => {
    const column = ["2AC #1 no link", "", null, "2AC #2 non-unique", "extends the card"];

    it("continues from the nearest marker above the row", () => {
        expect(nextArgNumber(column, 5, DEFAULT_ARG_MARKER, "2AC")).toBe(3);
        expect(nextArgNumber(column, 3, DEFAULT_ARG_MARKER, "2AC")).toBe(2);
    });

    it("starts at 1 with nothing above", () => {
        expect(nextArgNumber(column, 0, DEFAULT_ARG_MARKER, "2AC")).toBe(1);
        expect(nextArgNumber(["plain text"], 1, DEFAULT_ARG_MARKER, "2AC")).toBe(1);
    });

    it("ignores another speech's markers", () => {
        expect(nextArgNumber(["1NC #4 da"], 1, DEFAULT_ARG_MARKER, "2AC")).toBe(1);
    });

    it("reads markers typed by hand with loose spacing and case", () => {
        expect(nextArgNumber(["  2ac#7 perm"], 1, DEFAULT_ARG_MARKER, "2AC")).toBe(8);
    });

    it("follows a custom template", () => {
        expect(nextArgNumber(["1. a", "2. b"], 2, "%Number%.", "2AC")).toBe(3);
    });

    it("takes the nearest marker over a higher one further up", () => {
        expect(nextArgNumber(["2AC #9", "2AC #1"], 2, DEFAULT_ARG_MARKER, "2AC")).toBe(2);
    });
});
