import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nativeEditActionFor, runNativeEditActionForChord } from "@/lib/keymap/nativeEdit";
import { isMacPlatform } from "@/lib/platform";

const MOD = isMacPlatform() ? "Meta" : "Ctrl";

let execCommand: ReturnType<typeof vi.fn>;

/** Run as if on `platform`, for the chords whose meaning differs by OS. */
function onPlatform(platform: string): void {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

afterEach(() => {
    vi.restoreAllMocks();
});

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
        expect(nativeEditActionFor(`${MOD}+a`)).toBe("selectAll");
    });

    it("deletes to the line start for Meta+Backspace on a Mac", () => {
        onPlatform("MacIntel");
        expect(nativeEditActionFor("Meta+Backspace")).toBe("deleteToLineStart");
    });

    it("deletes the previous word for Ctrl+Backspace off a Mac", () => {
        onPlatform("Win32");
        expect(nativeEditActionFor("Ctrl+Backspace")).toBe("deleteWordBack");
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
        onPlatform("MacIntel");
        const area = focusTextarea("line1\nline2", 9);
        expect(runNativeEditActionForChord("Meta+Backspace", area)).toBe(true);
        expect(area.selectionStart).toBe(6);
        expect(area.selectionEnd).toBe(9);
        expect(execCommand).toHaveBeenCalledWith("delete");
    });

    it("still claims delete-to-line-start when there is nothing to delete", () => {
        onPlatform("MacIntel");
        const area = focusTextarea("line1\nline2", 6);
        // True so callers never fall through to the app command (delete row).
        expect(runNativeEditActionForChord("Meta+Backspace", area)).toBe(true);
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("deletes the previous word and its trailing space on Windows", () => {
        onPlatform("Win32");
        const area = focusTextarea("extinction outweighs ", 21);
        expect(runNativeEditActionForChord("Ctrl+Backspace", area)).toBe(true);
        expect(area.selectionStart).toBe(11);
        expect(area.selectionEnd).toBe(21);
        expect(execCommand).toHaveBeenCalledWith("delete");
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
