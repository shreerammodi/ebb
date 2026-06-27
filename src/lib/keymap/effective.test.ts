import { describe, it, expect } from "vitest";

import { effectiveKeymap } from "./effective";
import { getPresetKeymap } from "./presets";

describe("effectiveKeymap", () => {
    it("returns the preset bindings when there are no overrides", () => {
        const keymap = effectiveKeymap({});
        const preset = getPresetKeymap();
        expect(keymap.bindings).toEqual(preset.bindings);
    });

    it("applies an override and removes the old preset chord for that command", () => {
        const keymap = effectiveKeymap({ "move.down": "g" });
        expect(keymap.bindings["g"]).toBe("move.down");
        // Original ArrowDown → move.down is gone.
        expect(keymap.bindings["ArrowDown"]).toBeUndefined();
    });

    it("leaves other bindings untouched", () => {
        const keymap = effectiveKeymap({ "move.down": "g" });
        expect(keymap.bindings["ArrowUp"]).toBe("move.up");
        expect(keymap.bindings["ArrowLeft"]).toBe("move.left");
    });

    it("ignores empty override chords", () => {
        const keymap = effectiveKeymap({ "move.down": "" });
        expect(keymap.bindings["ArrowDown"]).toBe("move.down");
    });

    it("names the keymap to indicate overrides are applied", () => {
        expect(effectiveKeymap({}).name).toBe("default+overrides");
    });
});

describe("COMMON_NORMAL bindings", () => {
    it("Ctrl+a → sheet.newAff", () => {
        const km = effectiveKeymap({});
        expect(km.bindings["Ctrl+a"]).toBe("sheet.newAff");
    });

    it("Ctrl+n → sheet.newNeg", () => {
        const km = effectiveKeymap({});
        expect(km.bindings["Ctrl+n"]).toBe("sheet.newNeg");
    });

    it("Ctrl+r → sheet.rename", () => {
        const km = effectiveKeymap({});
        expect(km.bindings["Ctrl+r"]).toBe("sheet.rename");
    });
});
