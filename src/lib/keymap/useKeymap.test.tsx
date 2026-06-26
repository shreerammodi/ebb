import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useKeymap } from "./useKeymap";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
    });
}

function Harness() {
    useKeymap();
    return <div data-testid="harness" />;
}

function dispatchKey(key: string, init: Partial<KeyboardEventInit> = {}) {
    act(() => {
        window.dispatchEvent(
            new KeyboardEvent("keydown", {
                key,
                bubbles: true,
                cancelable: true,
                ...init,
            }),
        );
    });
}

function freshRound() {
    useRoundStore
        .getState()
        .createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    const id = useRoundStore.getState().addSheet({ title: "DA", group: "aff" });
    useRoundStore.getState().setActiveSheet(id);
    return id;
}

describe("useKeymap — flat modeless navigation", () => {
    beforeEach(resetStore);

    it("ArrowDown moves selection to the next row", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        render(<Harness />);
        dispatchKey("ArrowDown");

        expect(useRoundStore.getState().selection?.row).toBe(1);
    });

    it("Enter spawns a sibling below", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        render(<Harness />);
        dispatchKey("Enter");

        expect(useRoundStore.getState().selection?.row).toBe(1);
    });

    it("Shift+Enter spawns a response in the next column", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        render(<Harness />);
        dispatchKey("Enter", { shiftKey: true });

        expect(useRoundStore.getState().selection?.speechId).toBe(
            speeches[1].id,
        );
        expect(useRoundStore.getState().selection?.row).toBe(0);
    });

    it("Tab steps to the next column, Shift+Tab to the previous", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        // Place nodes in both columns so Tab has somewhere to land — arrow
        // navigation skips empty cells.
        useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[1].id, row: 0 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        render(<Harness />);
        dispatchKey("Tab");
        expect(useRoundStore.getState().selection?.speechId).toBe(
            speeches[1].id,
        );

        dispatchKey("Tab", { shiftKey: true });
        expect(useRoundStore.getState().selection?.speechId).toBe(
            speeches[0].id,
        );
    });

    it("Ctrl+m grabs the selected node (sets moveSource)", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        const nodeId = useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        render(<Harness />);
        dispatchKey("m", { ctrlKey: true });

        expect(useRoundStore.getState().moveSource).toBe(nodeId);
    });

    it("cleans up its listener on unmount", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        const { unmount } = render(<Harness />);
        unmount();
        dispatchKey("ArrowDown");

        // Selection unchanged because the listener was removed.
        expect(useRoundStore.getState().selection?.row).toBe(0);
    });
});
