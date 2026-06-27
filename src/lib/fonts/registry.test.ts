import { describe, it, expect } from "vitest";
import {
    FONTS,
    DEFAULT_FONT_ID,
    isFontId,
    resolveFontId,
    fontCssVar,
} from "./registry";

describe("font registry", () => {
    it("lists exactly the four curated fonts in order", () => {
        expect(FONTS.map((f) => f.id)).toEqual([
            "commit-mono",
            "plex-mono",
            "dm-sans",
            "inter",
        ]);
    });

    it("defaults to commit-mono", () => {
        expect(DEFAULT_FONT_ID).toBe("commit-mono");
    });

    it("maps each id to its next/font css variable", () => {
        expect(fontCssVar("commit-mono")).toBe("var(--font-commit-mono)");
        expect(fontCssVar("plex-mono")).toBe("var(--font-ibm-plex-mono)");
        expect(fontCssVar("dm-sans")).toBe("var(--font-dm-sans)");
        expect(fontCssVar("inter")).toBe("var(--font-inter)");
    });

    it("recognizes valid ids and rejects others", () => {
        expect(isFontId("inter")).toBe(true);
        expect(isFontId("comic-sans")).toBe(false);
        expect(isFontId(undefined)).toBe(false);
        expect(isFontId(42)).toBe(false);
    });

    it("resolves unknown/absent values to the default", () => {
        expect(resolveFontId("dm-sans")).toBe("dm-sans");
        expect(resolveFontId("nope")).toBe("commit-mono");
        expect(resolveFontId(undefined)).toBe("commit-mono");
    });

    it("categorizes mono vs sans", () => {
        const byId = Object.fromEntries(FONTS.map((f) => [f.id, f.category]));
        expect(byId["commit-mono"]).toBe("mono");
        expect(byId["plex-mono"]).toBe("mono");
        expect(byId["dm-sans"]).toBe("sans");
        expect(byId["inter"]).toBe("sans");
    });
});
