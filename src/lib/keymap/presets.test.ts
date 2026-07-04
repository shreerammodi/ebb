import { it, expect } from "vitest";

import { FLAT_KEYMAP } from "@/lib/keymap/presets";
import { isMacPlatform } from "@/lib/platform";

const mod = isMacPlatform() ? "Meta" : "Ctrl";

it("binds sheet switching to brackets and help to question mark", () => {
    expect(FLAT_KEYMAP.bindings["]"]).toBe("sheet.next");
    expect(FLAT_KEYMAP.bindings["["]).toBe("sheet.prev");
    expect(FLAT_KEYMAP.bindings["?"]).toBe("help.open");
});

it("binds the platform modifier+Shift+H to format.toggleHighlight", () => {
    // Shift is encoded in the uppercase printable key, like redo's `${mod}+Z`.
    expect(FLAT_KEYMAP.bindings[`${mod}+H`]).toBe("format.toggleHighlight");
    expect(FLAT_KEYMAP.bindings[`${mod}+b`]).toBe("format.toggleBold");
});

it("binds undo and redo on the platform modifier", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+z`]).toBe("edit.undo");
    expect(FLAT_KEYMAP.bindings[`${mod}+Z`]).toBe("edit.redo");
});

it("leaves grid-native gestures unbound (Handsontable owns them)", () => {
    for (const chord of ["Enter", "Shift+Enter", "Tab", "Shift+Tab", "Delete", "ArrowDown"]) {
        expect(FLAT_KEYMAP.bindings[chord]).toBeUndefined();
    }
});

it("binds row delete to the platform modifier+Backspace", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+Backspace`]).toBe("row.delete");
});

it("binds the platform modifier+p to palette.open and 1-9 to sheet jumps", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+p`]).toBe("palette.open");
    expect(FLAT_KEYMAP.bindings[`${mod}+1`]).toBe("sheet.jump1");
    expect(FLAT_KEYMAP.bindings[`${mod}+9`]).toBe("sheet.jump9");
});
