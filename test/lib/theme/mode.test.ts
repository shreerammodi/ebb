import { describe, expect, it } from "vitest";

import { resolveMode, resolveThemeMode } from "@/lib/theme/mode";

describe("resolveMode", () => {
    it("dark mode is always dark", () => {
        expect(resolveMode("dark", false)).toBe("dark");
        expect(resolveMode("dark", true)).toBe("dark");
    });

    it("light mode is always light", () => {
        expect(resolveMode("light", false)).toBe("light");
        expect(resolveMode("light", true)).toBe("light");
    });

    it("system mode follows the OS preference", () => {
        expect(resolveMode("system", true)).toBe("dark");
        expect(resolveMode("system", false)).toBe("light");
    });
});

describe("resolveThemeMode", () => {
    it("passes through valid values", () => {
        expect(resolveThemeMode("light")).toBe("light");
        expect(resolveThemeMode("dark")).toBe("dark");
        expect(resolveThemeMode("system")).toBe("system");
    });

    it("falls back to system for missing or invalid values", () => {
        expect(resolveThemeMode(undefined)).toBe("system");
        expect(resolveThemeMode("neon")).toBe("system");
    });
});
