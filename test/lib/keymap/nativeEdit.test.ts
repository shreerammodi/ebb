import { beforeEach, describe, expect, it, vi } from "vitest";

import { nativeEditActionFor, runNativeEditActionForChord } from "@/lib/keymap/nativeEdit";
import { isMacPlatform } from "@/lib/platform";

const MOD = isMacPlatform() ? "Meta" : "Ctrl";

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
    execCommand = vi.fn();
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    document.body.innerHTML = "";
});

function focusTextarea(value: string, caret: number): HTMLTextAreaElement {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.focus();
    area.setSelectionRange(caret, caret);
    return area;
}

describe("nativeEditActionFor", () => {
    it("maps the reserved editing chords for this platform", () => {
        expect(nativeEditActionFor(`${MOD}+z`)).toBe("undo");
        expect(nativeEditActionFor(`${MOD}+Z`)).toBe("redo");
        expect(nativeEditActionFor(`${MOD}+Backspace`)).toBe("deleteToLineStart");
        expect(nativeEditActionFor(`${MOD}+a`)).toBe("selectAll");
    });

    it("leaves clipboard chords and unbound chords alone", () => {
        expect(nativeEditActionFor(`${MOD}+c`)).toBeNull();
        expect(nativeEditActionFor(`${MOD}+v`)).toBeNull();
        expect(nativeEditActionFor(`${MOD}+x`)).toBeNull();
        expect(nativeEditActionFor(`${MOD}+u`)).toBeNull();
        expect(nativeEditActionFor(null)).toBeNull();
    });
});

describe("runNativeEditActionForChord", () => {
    it("undoes through execCommand while a field is focused", () => {
        const area = focusTextarea("typed", 5);
        expect(runNativeEditActionForChord(`${MOD}+z`, area)).toBe(true);
        expect(execCommand).toHaveBeenCalledWith("undo");
    });

    it("redoes through execCommand while a field is focused", () => {
        const area = focusTextarea("typed", 5);
        expect(runNativeEditActionForChord(`${MOD}+Z`, area)).toBe(true);
        expect(execCommand).toHaveBeenCalledWith("redo");
    });

    it("selects the field's contents for the select-all chord", () => {
        const area = focusTextarea("hello", 5);
        const select = vi.spyOn(area, "select");
        expect(runNativeEditActionForChord(`${MOD}+a`, area)).toBe(true);
        expect(select).toHaveBeenCalledTimes(1);
    });

    it("deletes from the caret to the line start", () => {
        const area = focusTextarea("line1\nline2", 9);
        expect(runNativeEditActionForChord(`${MOD}+Backspace`, area)).toBe(true);
        expect(area.selectionStart).toBe(6);
        expect(area.selectionEnd).toBe(9);
        expect(execCommand).toHaveBeenCalledWith("delete");
    });

    it("still claims delete-to-line-start when there is nothing to delete", () => {
        const area = focusTextarea("line1\nline2", 6);
        // True so callers never fall through to the app command (delete row).
        expect(runNativeEditActionForChord(`${MOD}+Backspace`, area)).toBe(true);
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("claims nothing without a focused field", () => {
        expect(runNativeEditActionForChord(`${MOD}+z`, null)).toBe(false);
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("claims nothing for chords the browser owns", () => {
        const area = focusTextarea("typed", 5);
        expect(runNativeEditActionForChord(`${MOD}+c`, area)).toBe(false);
        expect(runNativeEditActionForChord(`${MOD}+v`, area)).toBe(false);
        expect(execCommand).not.toHaveBeenCalled();
    });
});
