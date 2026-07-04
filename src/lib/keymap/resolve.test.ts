import { describe, it, expect } from "vitest";

import { isMacPlatform } from "@/lib/platform";

import { FLAT_KEYMAP } from "./presets";
import { eventToChord, resolveCommand } from "./resolve";

const mod = isMacPlatform() ? "Meta" : "Ctrl";

type Ev = {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
};

function ev(key: string, mods: Partial<Omit<Ev, "key">> = {}): Ev {
    return {
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...mods,
    };
}

describe("eventToChord", () => {
    it("returns a single printable char as-is (no Shift+)", () => {
        expect(eventToChord(ev("j"))).toBe("j");
    });

    it("encodes shift in case for printable chars (O, not Shift+O)", () => {
        expect(eventToChord(ev("O", { shiftKey: true }))).toBe("O");
    });

    it("adds Shift+ for named keys when shiftKey is true", () => {
        expect(eventToChord(ev("Tab", { shiftKey: true }))).toBe("Shift+Tab");
    });

    it("does not add Shift+ for named keys when shiftKey is false", () => {
        expect(eventToChord(ev("Enter"))).toBe("Enter");
    });

    it("orders modifiers Meta+Ctrl+Alt+Shift", () => {
        expect(eventToChord(ev("k", { metaKey: true, ctrlKey: true, altKey: true }))).toBe(
            "Meta+Ctrl+Alt+k",
        );
    });

    it("builds Meta+k", () => {
        expect(eventToChord(ev("k", { metaKey: true }))).toBe("Meta+k");
    });

    it("builds Alt+Enter for named key with Alt", () => {
        expect(eventToChord(ev("Enter", { altKey: true }))).toBe("Alt+Enter");
    });
});

describe("resolveCommand (flat keymap)", () => {
    it("] resolves to sheet.next and [ to sheet.prev", () => {
        expect(resolveCommand(FLAT_KEYMAP, ev("]"))).toBe("sheet.next");
        expect(resolveCommand(FLAT_KEYMAP, ev("["))).toBe("sheet.prev");
    });

    it("Enter is unbound (the grid owns it)", () => {
        expect(resolveCommand(FLAT_KEYMAP, ev("Enter"))).toBeNull();
        expect(resolveCommand(FLAT_KEYMAP, ev("Enter", { shiftKey: true }))).toBeNull();
    });

    it("mod+p resolves to sheet.quickSwitch", () => {
        const mods = mod === "Meta" ? { metaKey: true } : { ctrlKey: true };
        expect(resolveCommand(FLAT_KEYMAP, ev("p", mods))).toBe("sheet.quickSwitch");
    });

    it("returns null for an unbound chord", () => {
        expect(resolveCommand(FLAT_KEYMAP, ev("z"))).toBeNull();
    });
});
