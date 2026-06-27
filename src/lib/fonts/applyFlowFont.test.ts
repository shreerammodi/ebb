import { describe, it, expect, afterEach } from "vitest";

import { applyFlowFont } from "./applyFlowFont";

describe("applyFlowFont", () => {
    afterEach(() => {
        document.documentElement.style.removeProperty("--font-flow");
    });

    it("writes the font's css variable to --font-flow on <html>", () => {
        applyFlowFont("inter");
        expect(document.documentElement.style.getPropertyValue("--font-flow")).toBe(
            "var(--font-inter)",
        );
    });

    it("switches the variable when called again", () => {
        applyFlowFont("inter");
        applyFlowFont("commit-mono");
        expect(document.documentElement.style.getPropertyValue("--font-flow")).toBe(
            "var(--font-commit-mono)",
        );
    });
});
