import { describe, expect, it } from "vitest";

import { chordToAccelerator, chordForCommand, menuAccelerators } from "./accelerator";
import type { Keymap } from "./types";

describe("chordToAccelerator", () => {
    it("converts lowercase letters to plain accelerators", () => {
        expect(chordToAccelerator("Meta+z")).toBe("Cmd+Z");
        expect(chordToAccelerator("Ctrl+b")).toBe("Ctrl+B");
    });

    it("decodes shift from uppercase letters", () => {
        expect(chordToAccelerator("Meta+Z")).toBe("Cmd+Shift+Z");
        expect(chordToAccelerator("Ctrl+A")).toBe("Ctrl+Shift+A");
    });

    it("keeps explicit modifiers in Cmd, Ctrl, Alt, Shift order", () => {
        expect(chordToAccelerator("Meta+Alt+o")).toBe("Cmd+Alt+O");
        expect(chordToAccelerator("Meta+Shift+Enter")).toBe("Cmd+Shift+Enter");
    });

    it("maps symbol and named keys to muda tokens", () => {
        expect(chordToAccelerator("Meta+,")).toBe("Cmd+Comma");
        expect(chordToAccelerator("Meta+\\")).toBe("Cmd+Backslash");
        expect(chordToAccelerator("Meta+Backspace")).toBe("Cmd+Backspace");
        expect(chordToAccelerator("Ctrl+ArrowUp")).toBe("Ctrl+Up");
        expect(chordToAccelerator("Meta+1")).toBe("Cmd+1");
    });

    it("allows bare function keys", () => {
        expect(chordToAccelerator("F1")).toBe("F1");
        expect(chordToAccelerator("Meta+F5")).toBe("Cmd+F5");
    });

    it("returns null for chords that cannot be accelerators", () => {
        expect(chordToAccelerator("]")).toBeNull(); // bare printable
        expect(chordToAccelerator("?")).toBeNull(); // shifted symbol, bare
        expect(chordToAccelerator("Alt+\\")).toBeNull(); // Alt-only types glyphs
        expect(chordToAccelerator("Enter")).toBeNull(); // bare named key
        expect(chordToAccelerator("Meta+z Meta+x")).toBeNull(); // two-key sequence
        expect(chordToAccelerator("Meta+?")).toBeNull(); // shifted symbol has no token
    });
});

const KEYMAP: Keymap = {
    name: "test",
    bindings: {
        "Meta+z": "edit.undo",
        "Meta+Z": "edit.redo",
        "]": "sheet.next",
        "?": "help.open",
        F1: "sheet.rename",
    },
};

describe("chordForCommand", () => {
    it("returns the first chord bound to the command", () => {
        expect(chordForCommand(KEYMAP, "edit.undo")).toBe("Meta+z");
        expect(chordForCommand(KEYMAP, "sheet.next")).toBe("]");
    });

    it("returns null for unbound commands", () => {
        expect(chordForCommand(KEYMAP, "sidebar.toggle")).toBeNull();
    });
});

describe("menuAccelerators", () => {
    it("maps every menu command, using empty string for no accelerator", () => {
        const accels = menuAccelerators(KEYMAP);
        expect(accels["edit.undo"]).toBe("Cmd+Z");
        expect(accels["edit.redo"]).toBe("Cmd+Shift+Z");
        expect(accels["sheet.next"]).toBe(""); // bare printable
        expect(accels["sheet.rename"]).toBe("F1"); // rebound to a function key
        expect(accels["sidebar.toggle"]).toBe(""); // unbound in this keymap
        // Every menu command id is present, even when unbound.
        expect(Object.keys(accels).length).toBeGreaterThanOrEqual(18);
    });
});
