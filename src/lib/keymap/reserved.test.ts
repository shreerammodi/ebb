import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { isMacPlatform } from "@/lib/platform";

import { reservedChords } from "./reserved";

describe("reservedChords", () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
        // Restore navigator after each test.
        vi.stubGlobal("navigator", originalNavigator);
        vi.unstubAllGlobals();
    });

    function setPlatform(platform: string) {
        vi.stubGlobal("navigator", { platform, userAgent: "" });
    }

    it("returns Meta+ chords on macOS", () => {
        setPlatform("MacIntel");
        // Re-import to pick up the new navigator.platform.
        const chords = reservedChords();
        expect(chords.has("Meta+n")).toBe(true);
        expect(chords.has("Meta+a")).toBe(true);
        expect(chords.has("Meta+z")).toBe(true);
        expect(chords.has("Meta+Z")).toBe(true);
        expect(chords.has("Meta+1")).toBe(true);
        expect(chords.has("Meta+Backspace")).toBe(true);
        expect(chords.has("Meta+Shift+Backspace")).toBe(true);
        // Ctrl variants should NOT be present on Mac.
        expect(chords.has("Ctrl+n")).toBe(false);
    });

    it("returns Ctrl+ chords on Windows", () => {
        setPlatform("Win32");
        const chords = reservedChords();
        expect(chords.has("Ctrl+n")).toBe(true);
        expect(chords.has("Ctrl+a")).toBe(true);
        expect(chords.has("Ctrl+z")).toBe(true);
        expect(chords.has("Ctrl+Z")).toBe(true);
        expect(chords.has("Ctrl+1")).toBe(true);
        expect(chords.has("Ctrl+Backspace")).toBe(true);
        expect(chords.has("Ctrl+Shift+Backspace")).toBe(true);
        // Meta variants should NOT be present on Windows.
        expect(chords.has("Meta+n")).toBe(false);
    });

    it("returns Ctrl+ chords on Linux", () => {
        setPlatform("Linux x86_64");
        const chords = reservedChords();
        expect(chords.has("Ctrl+n")).toBe(true);
        expect(chords.has("Ctrl+\\")).toBe(true);
        expect(chords.has("Ctrl+,")).toBe(true);
        expect(chords.has("Meta+n")).toBe(false);
    });

    it("includes all sheet jump number chords", () => {
        setPlatform("Win32");
        const chords = reservedChords();
        for (let i = 1; i <= 9; i++) {
            expect(chords.has(`Ctrl+${i}`)).toBe(true);
        }
    });

    it("includes sidebar and settings chords", () => {
        setPlatform("MacIntel");
        const chords = reservedChords();
        expect(chords.has("Meta+\\")).toBe(true);
        expect(chords.has("Meta+,")).toBe(true);
    });
});
