import { describe, it, expect } from "vitest";

import { FONTS, DEFAULT_FONT_ID, isFontId, resolveFontId, fontCssVar } from "@/lib/fonts/registry";

describe("font registry", () => {
    it("lists exactly the seven curated fonts in order", () => {
        expect(FONTS.map((f) => f.id)).toEqual([
            "commit-mono",
            "plex-mono",
            "dm-sans",
            "plex-sans",
            "cabin",
            "lato",
            "open-sans",
        ]);
    });

    it("defaults to dm-sans", () => {
        expect(DEFAULT_FONT_ID).toBe("dm-sans");
    });

    it("maps each id to its next/font css variable", () => {
        expect(fontCssVar("commit-mono")).toBe("var(--font-commit-mono)");
        expect(fontCssVar("plex-mono")).toBe("var(--font-ibm-plex-mono)");
        expect(fontCssVar("dm-sans")).toBe("var(--font-dm-sans)");
        expect(fontCssVar("plex-sans")).toBe("var(--font-ibm-plex-sans)");
        expect(fontCssVar("cabin")).toBe("var(--font-cabin)");
        expect(fontCssVar("lato")).toBe("var(--font-lato)");
        expect(fontCssVar("open-sans")).toBe("var(--font-open-sans)");
    });

    it("recognizes valid ids and rejects others", () => {
        expect(isFontId("plex-sans")).toBe(true);
        expect(isFontId("cabin")).toBe(true);
        expect(isFontId("comic-sans")).toBe(false);
        expect(isFontId(undefined)).toBe(false);
        expect(isFontId(42)).toBe(false);
    });

    it("resolves unknown/absent values to the default", () => {
        expect(resolveFontId("plex-sans")).toBe("plex-sans");
        expect(resolveFontId("nope")).toBe("dm-sans");
        expect(resolveFontId(undefined)).toBe("dm-sans");
    });

    it("categorizes mono vs sans", () => {
        const byId = Object.fromEntries(FONTS.map((f) => [f.id, f.category]));
        expect(byId["commit-mono"]).toBe("mono");
        expect(byId["plex-mono"]).toBe("mono");
        expect(byId["dm-sans"]).toBe("sans");
        expect(byId["plex-sans"]).toBe("sans");
        expect(byId["cabin"]).toBe("sans");
        expect(byId["lato"]).toBe("sans");
        expect(byId["open-sans"]).toBe("sans");
    });
});
