import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import UndoTreePanel from "./UndoTreePanel";

function fresh() {
    const fmt = makeFormat(POLICY_PRESET);
    useRoundStore.getState().createRound({ role: "aff", format: fmt });
    const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
    useRoundStore.getState().setActiveSheet(sheetId);
    const sp = fmt.speeches[1].id;
    return { sheetId, sp };
}

describe("UndoTreePanel", () => {
    beforeEach(() => {
        useRoundStore.setState({ round: null, history: null, activeSheetId: null });
    });

    it("renders nothing when there is no history", () => {
        const { container } = render(<UndoTreePanel />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders a row per history node and marks the current one", () => {
        const { sheetId, sp } = fresh();
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 0 });
        useRoundStore.getState().updateNodeText(a, "hi");

        render(<UndoTreePanel />);
        const tree = useRoundStore.getState().history!;
        const rows = screen.getAllByTestId(/^history-node-/);
        expect(rows.length).toBe(Object.keys(tree.nodes).length);

        const current = screen.getByTestId(`history-node-${tree.currentId}`);
        expect(current).toHaveAttribute("aria-current", "true");
    });

    it("clicking a node jumps the round to that snapshot", () => {
        const { sheetId, sp } = fresh();
        const root = useRoundStore.getState().history!.rootId;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 0 });
        useRoundStore.getState().updateNodeText(a, "hi");

        render(<UndoTreePanel />);
        fireEvent.click(screen.getByTestId(`history-node-${root}`));
        expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
    });
});
