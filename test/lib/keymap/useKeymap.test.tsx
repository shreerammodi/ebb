import { render } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type * as CommandsModule from "@/lib/commands/commands";
import { useKeymap } from "@/lib/keymap/useKeymap";
import { makeFlowRound } from "@/lib/model/flow";
import { isMacPlatform } from "@/lib/platform";
import { useFlowStore } from "@/lib/store/useFlowStore";

// Spy over the real executeCommand: the store-observing tests below need its
// behavior, the scope tests need only to see whether it was reached.
vi.mock("@/lib/commands/commands", async (importOriginal) => {
    const actual = await importOriginal<typeof CommandsModule>();
    return { ...actual, executeCommand: vi.fn(actual.executeCommand) };
});
import { executeCommand } from "@/lib/commands/commands";

const MOD = isMacPlatform() ? { metaKey: true } : { ctrlKey: true };

function Harness() {
    useKeymap();
    return <div data-testid="harness" />;
}

function dispatchKey(key: string, init: Partial<KeyboardEventInit> = {}, target?: EventTarget) {
    act(() => {
        const event = new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
            ...init,
        });
        (target ?? window).dispatchEvent(event);
    });
}

function freshRound() {
    const round = makeFlowRound({});
    useFlowStore.getState().loadRound(round);
    useFlowStore.getState().addSheet({ title: "DA", group: "neg" });
}

describe("useKeymap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            keymapOverrides: {},
            cheatsheetOpen: false,
        });
    });

    it("steps between sheets on the platform modifier and a bracket", () => {
        freshRound();
        const state = () => useFlowStore.getState();
        const second = state().activeSheetId!;
        render(<Harness />);
        dispatchKey("[", MOD);
        expect(state().activeSheetId).not.toBe(second);
        dispatchKey("]", MOD);
        expect(state().activeSheetId).toBe(second);
    });

    it("steps between sheets from inside the grid's cell editor", () => {
        freshRound();
        const state = () => useFlowStore.getState();
        const second = state().activeSheetId!;
        render(<Harness />);

        // Handsontable parks a textarea.handsontableInput over the cell being
        // typed in. The modifier is what carries the chord out of it.
        const editor = document.createElement("textarea");
        editor.className = "handsontableInput";
        document.body.appendChild(editor);
        dispatchKey("[", MOD, editor);

        expect(state().activeSheetId).not.toBe(second);
        editor.remove();
    });

    it("toggles the cheatsheet on ? and respects user overrides", () => {
        freshRound();
        render(<Harness />);
        dispatchKey("?", { shiftKey: true });
        expect(useFlowStore.getState().cheatsheetOpen).toBe(true);

        useFlowStore.setState({ keymapOverrides: { "help.open": "F1" } });
        dispatchKey("F1");
        expect(useFlowStore.getState().cheatsheetOpen).toBe(false);
        // The old chord no longer fires after the override.
        dispatchKey("?", { shiftKey: true });
        expect(useFlowStore.getState().cheatsheetOpen).toBe(false);
    });

    it("leaves a bare bracket to the cell it was typed in", () => {
        freshRound();
        const state = () => useFlowStore.getState();
        const second = state().activeSheetId!;
        render(<Harness />);

        const editor = document.createElement("textarea");
        editor.className = "handsontableInput";
        document.body.appendChild(editor);
        dispatchKey("[", {}, editor);

        expect(state().activeSheetId).toBe(second);
        editor.remove();
    });

    it("does not fire bare-key chords while typing in a text field", () => {
        freshRound();
        render(<Harness />);

        const textarea = document.createElement("textarea");
        document.body.appendChild(textarea);
        dispatchKey("?", { shiftKey: true }, textarea);

        expect(useFlowStore.getState().cheatsheetOpen).toBe(false);
        textarea.remove();
    });
});

describe("useKeymap native editing chords", () => {
    let execCommand: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        useFlowStore.setState({ round: null, activeSheetId: null, keymapOverrides: {} });
        freshRound();
        execCommand = vi.fn();
        document.execCommand = execCommand as unknown as typeof document.execCommand;
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    function desktop(): void {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    }

    function focus(tag: "input" | "textarea", className?: string): HTMLElement {
        const el = document.createElement(tag);
        if (className) el.className = className;
        document.body.appendChild(el);
        el.focus();
        return el;
    }

    it("performs the native undo for the modifier+z chord in the cell editor", () => {
        desktop();
        render(<Harness />);
        const editor = focus("textarea", "handsontableInput");
        dispatchKey("z", MOD, editor);
        expect(execCommand).toHaveBeenCalledWith("undo");
        // The grid behind the editor does not also undo.
        expect(executeCommand).not.toHaveBeenCalled();
        editor.remove();
    });

    it("performs the native undo for a chrome text field too", () => {
        desktop();
        render(<Harness />);
        const input = focus("input");
        dispatchKey("z", MOD, input);
        expect(execCommand).toHaveBeenCalledWith("undo");
        expect(executeCommand).not.toHaveBeenCalled();
        input.remove();
    });

    it("prevents the engine's default once the native edit ran", () => {
        desktop();
        render(<Harness />);
        const editor = focus("textarea", "handsontableInput");
        const event = new KeyboardEvent("keydown", {
            key: "z",
            bubbles: true,
            cancelable: true,
            ...MOD,
        });
        act(() => {
            editor.dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(true);
        editor.remove();
    });

    it("leaves the native undo to the browser on the web build", () => {
        render(<Harness />);
        const editor = focus("textarea", "handsontableInput");
        const event = new KeyboardEvent("keydown", {
            key: "z",
            bubbles: true,
            cancelable: true,
            ...MOD,
        });
        act(() => {
            editor.dispatchEvent(event);
        });
        expect(execCommand).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        editor.remove();
    });

    it("stays out of the clipboard chords while typing", () => {
        desktop();
        render(<Harness />);
        const editor = focus("textarea", "handsontableInput");
        const event = new KeyboardEvent("keydown", {
            key: "c",
            bubbles: true,
            cancelable: true,
            ...MOD,
        });
        act(() => {
            editor.dispatchEvent(event);
        });
        expect(execCommand).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        editor.remove();
    });

    it("deletes to line start on modifier+Backspace instead of deleting the row", () => {
        desktop();
        render(<Harness />);
        const editor = focus("textarea", "handsontableInput") as HTMLTextAreaElement;
        editor.value = "line1\nline2";
        editor.setSelectionRange(9, 9);
        dispatchKey("Backspace", MOD, editor);
        expect(execCommand).toHaveBeenCalledWith("delete");
        expect(editor.selectionStart).toBe(6);
        expect(executeCommand).not.toHaveBeenCalled();
        editor.remove();
    });

    it("selects the editor's text on select-all instead of adding a sheet", () => {
        desktop();
        render(<Harness />);
        const editor = focus("textarea", "handsontableInput") as HTMLTextAreaElement;
        const select = vi.spyOn(editor, "select");
        dispatchKey("a", MOD, editor);
        expect(select).toHaveBeenCalledTimes(1);
        expect(executeCommand).not.toHaveBeenCalled();
        editor.remove();
    });
});

describe("useKeymap grid scope", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        useFlowStore.setState({ round: null, activeSheetId: null, keymapOverrides: {} });
        freshRound();
        render(<Harness />);
    });

    function focus(tag: "input" | "textarea", className?: string): HTMLElement {
        const el = document.createElement(tag);
        if (className) el.className = className;
        document.body.appendChild(el);
        el.focus();
        return el;
    }

    it("does not format the sheet behind a chrome text field", () => {
        const input = focus("input");
        dispatchKey("b", MOD, input);
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("formats from the grid's own cell editor", () => {
        const editor = focus("textarea", "handsontableInput");
        dispatchKey("b", MOD, editor);
        expect(executeCommand).toHaveBeenCalledWith("format.toggleBold");
    });

    it("formats when no text field holds focus", () => {
        dispatchKey("b", MOD);
        expect(executeCommand).toHaveBeenCalledWith("format.toggleBold");
    });

    it("still runs an app-scoped chord from a chrome text field", () => {
        const input = focus("input");
        dispatchKey("P", { ...MOD, shiftKey: true }, input);
        expect(executeCommand).toHaveBeenCalledWith("palette.open");
    });
});
