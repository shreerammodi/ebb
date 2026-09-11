import { it, expect } from "vitest";

import { FLAT_KEYMAP } from "@/lib/keymap/presets";
import { isMacPlatform } from "@/lib/platform";

const mod = isMacPlatform() ? "Meta" : "Ctrl";

it("binds sheet stepping to the platform modifier and brackets", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+]`]).toBe("sheet.next");
    expect(FLAT_KEYMAP.bindings[`${mod}+[`]).toBe("sheet.prev");
    // Bare, they would be text to the cell editor rather than a command.
    expect(FLAT_KEYMAP.bindings["]"]).toBeUndefined();
    expect(FLAT_KEYMAP.bindings["["]).toBeUndefined();
});

it("binds help to question mark", () => {
    expect(FLAT_KEYMAP.bindings["?"]).toBe("help.open");
});

it("binds the platform modifier+Shift+H to format.toggleHighlight", () => {
    // Shift is encoded in the uppercase printable key, like redo's `${mod}+Z`.
    expect(FLAT_KEYMAP.bindings[`${mod}+H`]).toBe("format.toggleHighlight");
    expect(FLAT_KEYMAP.bindings[`${mod}+b`]).toBe("format.toggleBold");
});

it("binds the platform modifier+k to format.toggleKicked", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+k`]).toBe("format.toggleKicked");
});

it("binds modifier+e to Extend and leaves Jump to source unbound", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+e`]).toBe("cell.extend");
    expect(Object.values(FLAT_KEYMAP.bindings)).not.toContain("cell.jumpToSource");
    expect(FLAT_KEYMAP.bindings[`${mod}+E`]).toBe("cell.sendToDoc");
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

it("binds modifier+p to the search palette, modifier+Shift+p to command mode", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+p`]).toBe("sheet.quickSwitch");
    expect(FLAT_KEYMAP.bindings[`${mod}+P`]).toBe("palette.open");
});

it("binds the platform modifier+j to rfd.toggle", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+j`]).toBe("rfd.toggle");
});

it("binds the platform modifier 1-9 to sheet jumps", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+1`]).toBe("sheet.jump1");
    expect(FLAT_KEYMAP.bindings[`${mod}+9`]).toBe("sheet.jump9");
});

it("binds the split-view chords", () => {
    expect(FLAT_KEYMAP.bindings["Alt+\\"]).toBe("split.toggle");
    expect(FLAT_KEYMAP.bindings["Alt+h"]).toBe("split.focusLeft");
    expect(FLAT_KEYMAP.bindings["Alt+l"]).toBe("split.focusRight");
});

it("binds the sheet move chords to the shifted brackets", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+{`]).toBe("sheet.moveUp");
    expect(FLAT_KEYMAP.bindings[`${mod}+}`]).toBe("sheet.moveDown");
});

it("binds range extension to the Alt brackets", () => {
    expect(FLAT_KEYMAP.bindings["Alt+["]).toBe("sheet.extendUp");
    expect(FLAT_KEYMAP.bindings["Alt+]"]).toBe("sheet.extendDown");
});
