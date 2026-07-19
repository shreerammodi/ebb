import { describe, expect, it } from "vitest";

import { safeSheetName } from "@/lib/export/sheetNames";

describe("safeSheetName", () => {
    it("caps names at 31 characters", () => {
        const used = new Set<string>();
        const name = safeSheetName("A very very very long flow sheet title", used);
        expect(name.length).toBeLessThanOrEqual(31);
    });

    it("strips illegal Excel characters", () => {
        const used = new Set<string>();
        const name = safeSheetName("Plan: T/L [Politics] *DA*", used);
        expect(name).not.toMatch(/[:\\/?*\[\]]/);
    });

    it("uniques case-insensitively with numbered suffixes", () => {
        const used = new Set<string>();
        const first = safeSheetName("Politics DA", used);
        const second = safeSheetName("politics da", used);
        const third = safeSheetName("Politics DA", used);
        expect(first).toBe("Politics DA");
        expect(second).toBe("politics da (2)");
        expect(third).toBe("Politics DA (3)");
    });

    it("falls back to Sheet for an empty title", () => {
        const used = new Set<string>();
        expect(safeSheetName("", used)).toBe("Sheet");
    });
});
