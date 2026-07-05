import { afterEach, describe, expect, it } from "vitest";

import { applySideColors } from "./applySideColors";

const styleEl = () => document.getElementById("ebb-side-colors");

afterEach(() => {
    styleEl()?.remove();
});

describe("applySideColors", () => {
    it("injects both side vars scoped to chrome and the flow sheet", () => {
        applySideColors({ aff: "#123456", neg: "#abcdef" });
        const css = styleEl()?.textContent ?? "";
        expect(css).toContain(":root, .dark, .handsontable");
        expect(css).toContain("--aff: #123456;");
        expect(css).toContain("--neg: #abcdef;");
    });

    it("emits only the overridden side, leaving the other's default in place", () => {
        applySideColors({ aff: "#123456", neg: null });
        const css = styleEl()?.textContent ?? "";
        expect(css).toContain("--aff: #123456;");
        expect(css).not.toContain("--neg");
    });

    it("removes the style element when neither side is customized", () => {
        applySideColors({ aff: "#123456", neg: null });
        expect(styleEl()).not.toBeNull();
        applySideColors({ aff: null, neg: null });
        expect(styleEl()).toBeNull();
    });
});
