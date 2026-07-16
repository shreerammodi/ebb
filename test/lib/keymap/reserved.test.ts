import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { reservedChords } from "@/lib/keymap/reserved";
import { isMacPlatform } from "@/lib/platform";

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
        const chords = reservedChords();
        expect(chords.has("Meta+n")).toBe(true);
        expect(chords.has("Meta+a")).toBe(true);
        expect(chords.has("Meta+z")).toBe(true);
        expect(chords.has("Meta+Z")).toBe(true);
        expect(chords.has("Meta+1")).toBe(true);
        expect(chords.has("Meta+Backspace")).toBe(true);
        expect(chords.has("Meta+M")).toBe(true);
        // The bare Cmd+X is left unreserved so it stays a native cut.
        expect(chords.has("Meta+x")).toBe(false);
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
        expect(chords.has("Ctrl+M")).toBe(true);
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

    it("reserves the platform modifier+p (search palette / browser print)", () => {
        setPlatform("MacIntel");
        expect(reservedChords().has("Meta+p")).toBe(true);
        setPlatform("Win32");
        expect(reservedChords().has("Ctrl+p")).toBe(true);
    });

    it("reserves the platform modifier+Shift+p (command palette)", () => {
        setPlatform("MacIntel");
        expect(reservedChords().has("Meta+P")).toBe(true);
        setPlatform("Win32");
        expect(reservedChords().has("Ctrl+P")).toBe(true);
    });

    it("reserves the platform modifier+Shift+H (toggle highlight)", () => {
        setPlatform("MacIntel");
        expect(reservedChords().has("Meta+H")).toBe(true);
        setPlatform("Win32");
        expect(reservedChords().has("Ctrl+H")).toBe(true);
    });

    it("reserves the platform modifier+j (rfd toggle)", () => {
        setPlatform("MacIntel");
        expect(reservedChords().has("Meta+j")).toBe(true);
    });
});
