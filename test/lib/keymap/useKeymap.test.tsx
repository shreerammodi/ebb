import { render } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, beforeEach } from "vitest";

import { useKeymap } from "@/lib/keymap/useKeymap";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

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
    const round = makeFlowRound("aff");
    useFlowStore.getState().loadRound(round);
    useFlowStore.getState().addSheet({ title: "DA", group: "neg" });
}

describe("useKeymap", () => {
    beforeEach(() => {
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            keymapOverrides: {},
            cheatsheetOpen: false,
        });
    });

    it("fires bare-key sheet chords outside text entry", () => {
        freshRound();
        const state = () => useFlowStore.getState();
        const second = state().activeSheetId!;
        render(<Harness />);
        dispatchKey("[");
        expect(state().activeSheetId).not.toBe(second);
        dispatchKey("]");
        expect(state().activeSheetId).toBe(second);
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

    it("does not fire bare-key chords while typing in a text field", () => {
        freshRound();
        const state = () => useFlowStore.getState();
        const second = state().activeSheetId!;
        render(<Harness />);

        const textarea = document.createElement("textarea");
        document.body.appendChild(textarea);
        dispatchKey("[", {}, textarea);

        expect(state().activeSheetId).toBe(second);
        textarea.remove();
    });
});
