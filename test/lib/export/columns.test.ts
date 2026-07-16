import { describe, it, expect } from "vitest";

import { templateColumn, colLetter, AFF_COLUMNS, NEG_COLUMNS } from "@/lib/export/columns";

describe("templateColumn", () => {
    it("maps aff speeches to the 7-column aff template", () => {
        expect(templateColumn("aff", "1AC")).toBe(0);
        expect(templateColumn("aff", "Block")).toBe(3);
        expect(templateColumn("aff", "2AR")).toBe(6);
    });
    it("maps neg speeches to the 6-column neg template (no 1AC)", () => {
        expect(templateColumn("neg", "1NC")).toBe(0);
        expect(templateColumn("neg", "1AC")).toBe(-1);
    });
});

describe("colLetter", () => {
    it("converts 0-based index to a column letter", () => {
        expect(colLetter(0)).toBe("A");
        expect(colLetter(6)).toBe("G");
    });
});

describe("column constants", () => {
    it("match the template header order", () => {
        expect(AFF_COLUMNS).toEqual(["1AC", "1NC", "2AC", "Block", "1AR", "2NR", "2AR"]);
        expect(NEG_COLUMNS).toEqual(["1NC", "2AC", "Block", "1AR", "2NR", "2AR"]);
    });
});
