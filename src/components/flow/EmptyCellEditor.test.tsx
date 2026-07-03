import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import EmptyCellEditor from "./EmptyCellEditor";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
        pendingSpawn: null,
    });
}

/** Fresh round + flow sheet; returns { sheetId, speeches }. */
function setup() {
    resetStore();
    useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    const sheetId = useRoundStore.getState().addSheet({ title: "1AC", group: "aff" });
    useRoundStore.getState().setActiveSheet(sheetId);
    const speeches = useRoundStore.getState().round!.format.speeches;
    return { sheetId, speeches };
}

describe("EmptyCellEditor", () => {
    beforeEach(resetStore);

    it("creates a bare node on the first keystroke of a plain blank cell", () => {
        const { sheetId, speeches } = setup();
        const speechId = speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 2 });

        const { container } = render(<EmptyCellEditor sheetId={sheetId} speechId={speechId} />);
        const textarea = container.querySelector("textarea")!;
        fireEvent.change(textarea, { target: { value: "h" } });

        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes).toHaveLength(1);
        expect(nodes[0]).toMatchObject({ speechId, row: 2, parentId: null, text: "h" });
    });

    it("commits a pending sibling spawn with its inherited parent on first keystroke", () => {
        const { sheetId, speeches } = setup();
        const speechId = speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling(); // arms pending at row 1, moves cursor there

        const { container } = render(<EmptyCellEditor sheetId={sheetId} speechId={speechId} />);
        const textarea = container.querySelector("textarea")!;
        fireEvent.change(textarea, { target: { value: "y" } });

        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes).toHaveLength(2);
        const created = nodes.find((n) => n.row === 1)!;
        expect(created).toMatchObject({ speechId, parentId: null, text: "y" });
        expect(useRoundStore.getState().pendingSpawn).toBeNull();
    });

    it("Escape abandons a pending spawn and reverses its shift", () => {
        const { sheetId, speeches } = setup();
        const speechId = speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        const arg2 = useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling(); // occupied target → shifts arg2 to row 2

        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === arg2)!.row).toBe(2);

        const { container } = render(<EmptyCellEditor sheetId={sheetId} speechId={speechId} />);
        const textarea = container.querySelector("textarea")!;
        fireEvent.keyDown(textarea, { key: "Escape" });

        expect(useRoundStore.getState().pendingSpawn).toBeNull();
        // No node created and the shift is reversed.
        expect(useRoundStore.getState().round!.nodes).toHaveLength(2);
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === arg2)!.row).toBe(1);
    });
});
