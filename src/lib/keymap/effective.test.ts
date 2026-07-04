import { describe, it, expect } from "vitest";

import { isMacPlatform } from "@/lib/platform";

import { effectiveKeymap } from "./effective";
import { getPresetKeymap } from "./presets";

const mod = isMacPlatform() ? "Meta" : "Ctrl";

describe("effectiveKeymap", () => {
    it("returns the preset bindings when there are no overrides", () => {
        const keymap = effectiveKeymap({});
        const preset = getPresetKeymap();
        expect(keymap.bindings).toEqual(preset.bindings);
    });

    it("applies an override and removes the old preset chord for that command", () => {
        const keymap = effectiveKeymap({ "sheet.next": "g" });
        expect(keymap.bindings["g"]).toBe("sheet.next");
        // Original "]" binding for sheet.next is gone.
        expect(keymap.bindings["]"]).toBeUndefined();
    });

    it("leaves other bindings untouched", () => {
        const keymap = effectiveKeymap({ "sheet.next": "g" });
        expect(keymap.bindings["["]).toBe("sheet.prev");
        expect(keymap.bindings["?"]).toBe("help.open");
    });

    it("ignores empty override chords", () => {
        const keymap = effectiveKeymap({ "sheet.next": "" });
        expect(keymap.bindings["]"]).toBe("sheet.next");
    });

    it("names the keymap to indicate overrides are applied", () => {
        expect(effectiveKeymap({}).name).toBe("default+overrides");
    });
});

describe("platform modifier bindings", () => {
    it("mod+a → sheet.newAff", () => {
        const km = effectiveKeymap({});
        expect(km.bindings[`${mod}+a`]).toBe("sheet.newAff");
    });

    it("mod+n → sheet.newNeg", () => {
        const km = effectiveKeymap({});
        expect(km.bindings[`${mod}+n`]).toBe("sheet.newNeg");
    });

    it("mod+r → sheet.rename", () => {
        const km = effectiveKeymap({});
        expect(km.bindings[`${mod}+r`]).toBe("sheet.rename");
    });
});
