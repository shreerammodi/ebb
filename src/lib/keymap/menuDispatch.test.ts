import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchMenuCommand } from "./menuDispatch";

vi.mock("@/lib/commands/commands", () => ({ executeCommand: vi.fn() }));
import { executeCommand } from "@/lib/commands/commands";

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
    // jsdom does not implement execCommand; stub it as the assertion probe.
    execCommand = vi.fn();
    document.execCommand = execCommand as unknown as typeof document.execCommand;
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

function focusInput(value = ""): HTMLInputElement {
    const input = document.createElement("input");
    input.value = value;
    document.body.appendChild(input);
    input.focus();
    return input;
}

function focusTextarea(value: string, caret: number): HTMLTextAreaElement {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.focus();
    area.setSelectionRange(caret, caret);
    return area;
}

describe("dispatchMenuCommand", () => {
    it("selectAll selects the focused text field and runs no command", () => {
        const input = focusInput("hello");
        const select = vi.spyOn(input, "select");
        dispatchMenuCommand("selectAll");
        expect(select).toHaveBeenCalledTimes(1);
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("selectAll is a no-op without a focused text field", () => {
        dispatchMenuCommand("selectAll");
        expect(executeCommand).not.toHaveBeenCalled();
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("edit.undo performs a native undo while a text field is focused", () => {
        focusInput("typed");
        dispatchMenuCommand("edit.undo");
        expect(execCommand).toHaveBeenCalledWith("undo");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("edit.undo runs the app command without text focus", () => {
        dispatchMenuCommand("edit.undo");
        expect(executeCommand).toHaveBeenCalledWith("edit.undo");
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("edit.redo performs a native redo while a text field is focused", () => {
        focusInput("typed");
        dispatchMenuCommand("edit.redo");
        expect(execCommand).toHaveBeenCalledWith("redo");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("edit.redo runs the app command without text focus", () => {
        dispatchMenuCommand("edit.redo");
        expect(executeCommand).toHaveBeenCalledWith("edit.redo");
    });

    it("row.delete deletes to line start while a text field is focused", () => {
        const area = focusTextarea("line1\nline2", 9); // caret after "lin" in line2
        dispatchMenuCommand("row.delete");
        // Selection extends from the start of line2 to the caret, then deletes.
        expect(area.selectionStart).toBe(6);
        expect(area.selectionEnd).toBe(9);
        expect(execCommand).toHaveBeenCalledWith("delete");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("row.delete at line start with no selection deletes nothing", () => {
        focusTextarea("line1\nline2", 6); // caret exactly at start of line2
        dispatchMenuCommand("row.delete");
        expect(execCommand).not.toHaveBeenCalled();
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("row.delete runs the app command without text focus", () => {
        dispatchMenuCommand("row.delete");
        expect(executeCommand).toHaveBeenCalledWith("row.delete");
    });

    it("other menu ids run their command regardless of focus", () => {
        focusInput("typing");
        dispatchMenuCommand("format.toggleBold");
        expect(executeCommand).toHaveBeenCalledWith("format.toggleBold");
    });

    it("unknown ids are ignored", () => {
        dispatchMenuCommand("bogus");
        expect(executeCommand).not.toHaveBeenCalled();
    });
});
