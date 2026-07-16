import { describe, it, expect, afterEach } from "vitest";

import { applyFlowFont } from "@/lib/fonts/applyFlowFont";

describe("applyFlowFont", () => {
    afterEach(() => {
        document.documentElement.style.removeProperty("--font-flow");
    });

    it("writes the font's css variable to --font-flow on <html>", () => {
        applyFlowFont("plex-sans");
        expect(document.documentElement.style.getPropertyValue("--font-flow")).toBe(
            "var(--font-ibm-plex-sans)",
        );
    });

    it("switches the variable when called again", () => {
        applyFlowFont("plex-sans");
        applyFlowFont("commit-mono");
        expect(document.documentElement.style.getPropertyValue("--font-flow")).toBe(
            "var(--font-commit-mono)",
        );
    });
});
