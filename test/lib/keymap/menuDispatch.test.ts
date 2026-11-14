import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchMenuCommand } from "@/lib/keymap/menuDispatch";
import { isMacPlatform } from "@/lib/platform";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.mock("@/lib/commands/commands", () => ({ executeCommand: vi.fn() }));
import { executeCommand } from "@/lib/commands/commands";

const MOD = isMacPlatform() ? "Meta" : "Ctrl";

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
    // jsdom does not implement execCommand; stub it as the assertion probe.
    execCommand = vi.fn();
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    useFlowStore.setState({ keymapOverrides: {} });
    // Flow commands only run on the flow screen; the pre-existing tests below
    // exercise commands, so they run as if already on that route. The static
    // export serves flow/index.html, so this is the pathname the desktop shell
    // actually opens; `/flow` without the slash is the client router's form.
    window.history.pushState({}, "", "/flow/");
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

    // The Windows menu can take Ctrl+Backspace before the field does. In a
    // cell editor that must be the word a debater is fixing, not the row.
    it("row.delete deletes the previous word, never the row, in a field on Windows", () => {
        const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
        const editor = focusTextarea("card text", 9);
        editor.classList.add("handsontableInput");
        dispatchMenuCommand("row.delete");
        expect(editor.selectionStart).toBe(5);
        expect(execCommand).toHaveBeenCalledWith("delete");
        expect(executeCommand).not.toHaveBeenCalled();
        platform.mockRestore();
    });

    it("row.delete runs the app command without text focus", () => {
        dispatchMenuCommand("row.delete");
        expect(executeCommand).toHaveBeenCalledWith("row.delete");
    });

    it("drops a grid-scoped command while chrome text is focused", () => {
        focusInput("typing");
        dispatchMenuCommand("format.toggleBold");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("runs a grid-scoped command from the grid's own cell editor", () => {
        const editor = focusTextarea("card text", 4);
        editor.classList.add("handsontableInput");
        dispatchMenuCommand("format.toggleBold");
        expect(executeCommand).toHaveBeenCalledWith("format.toggleBold");
    });

    it("runs a grid-scoped command with no text focus", () => {
        dispatchMenuCommand("format.toggleBold");
        expect(executeCommand).toHaveBeenCalledWith("format.toggleBold");
    });

    it("runs an app-scoped command while chrome text is focused", () => {
        focusInput("typing");
        dispatchMenuCommand("settings.open");
        expect(executeCommand).toHaveBeenCalledWith("settings.open");
    });

    it("unknown ids are ignored", () => {
        dispatchMenuCommand("bogus");
        expect(executeCommand).not.toHaveBeenCalled();
    });
});

describe("dispatchMenuCommand with keymap overrides", () => {
    it("stops re-dispatching a command rebound off a native editing chord", () => {
        useFlowStore.setState({ keymapOverrides: { "edit.undo": `${MOD}+u` } });
        focusInput("typed");
        dispatchMenuCommand("edit.undo");
        expect(executeCommand).toHaveBeenCalledWith("edit.undo");
        expect(execCommand).not.toHaveBeenCalled();
    });

    it("re-dispatches a command rebound onto a native editing chord", () => {
        useFlowStore.setState({
            keymapOverrides: { "format.toggleBold": `${MOD}+Backspace` },
        });
        const area = focusTextarea("line1\nline2", 9);
        dispatchMenuCommand("format.toggleBold");
        expect(area.selectionStart).toBe(6);
        expect(execCommand).toHaveBeenCalledWith("delete");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("re-dispatches select-all for a command rebound onto the select-all chord", () => {
        useFlowStore.setState({ keymapOverrides: { "sheet.rename": `${MOD}+a` } });
        const input = focusInput("hello");
        const select = vi.spyOn(input, "select");
        dispatchMenuCommand("sheet.rename");
        expect(select).toHaveBeenCalledTimes(1);
        expect(executeCommand).not.toHaveBeenCalled();
    });
});

describe("dispatchMenuCommand off the flow screen", () => {
    beforeEach(() => {
        window.history.pushState({}, "", "/");
    });

    it("does not run a flow-scoped command", () => {
        dispatchMenuCommand("sheet.newAff");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("still runs a globally safe command", () => {
        dispatchMenuCommand("settings.open");
        expect(executeCommand).toHaveBeenCalledWith("settings.open");
    });

    it("still runs Join Round, the one route a guest with a code has here", () => {
        dispatchMenuCommand("collab.join");
        expect(executeCommand).toHaveBeenCalledWith("collab.join");
    });

    it("still runs selectAll", () => {
        const input = focusInput("hello");
        const select = vi.spyOn(input, "select");
        dispatchMenuCommand("selectAll");
        expect(select).toHaveBeenCalledTimes(1);
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("still re-dispatches a native-edit chord while a text field is focused", () => {
        focusInput("typed");
        dispatchMenuCommand("edit.undo");
        expect(execCommand).toHaveBeenCalledWith("undo");
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("runs a flow-scoped command again once back on the flow screen", () => {
        window.history.pushState({}, "", "/flow");
        dispatchMenuCommand("sheet.newAff");
        expect(executeCommand).toHaveBeenCalledWith("sheet.newAff");
    });

    it("recognizes the trailing-slash route the static export serves", () => {
        window.history.pushState({}, "", "/flow/");
        dispatchMenuCommand("sheet.next");
        expect(executeCommand).toHaveBeenCalledWith("sheet.next");
    });
});
