/**
 * PrintView component tests.
 *
 * Verifies that PrintView renders every sheet's title and every data row
 * (never a virtualized subset), with decorations mapped from cell meta.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import PrintView from "./PrintView";

function resetStore() {
    useFlowStore.setState({ round: null, activeSheetId: null });
}

function setup() {
    const round = makeFlowRound("aff");
    const flow = round.sheets.find((s) => s.kind !== "cx")!;
    flow.title = "Case";
    flow.data = Array.from({ length: 60 }, (_, r) => [`arg ${r}`, null]);
    flow.meta = { "0,0": { bold: true }, "1,0": { highlight: true } };
    useFlowStore.getState().loadRound(round);
    return round;
}

describe("PrintView", () => {
    beforeEach(resetStore);

    it("renders nothing without a round", () => {
        const { container } = render(<PrintView />);
        expect(container.firstChild).toBeNull();
    });

    it("renders every sheet in order with all data rows", () => {
        const round = setup();
        render(<PrintView />);
        const flow = round.sheets.find((s) => s.kind !== "cx")!;
        const cx = round.sheets.find((s) => s.kind === "cx")!;
        expect(screen.getByTestId(`print-sheet-title-${cx.id}`)).toHaveTextContent("CX");
        expect(screen.getByTestId(`print-sheet-title-${flow.id}`)).toHaveTextContent("Case");
        // All 60 rows render - print never virtualizes.
        expect(screen.getByText("arg 0")).toBeInTheDocument();
        expect(screen.getByText("arg 59")).toBeInTheDocument();
    });

    it("maps cell meta onto decoration classes", () => {
        setup();
        render(<PrintView />);
        expect(screen.getByText("arg 0")).toHaveClass("flow-bold");
        expect(screen.getByText("arg 1")).toHaveClass("flow-highlight");
    });

    it("renders CX period labels in the CX header", () => {
        const round = setup();
        const cx = round.sheets.find((s) => s.kind === "cx")!;
        cx.data = [["q", "a", null, null, null, null, null, null]];
        useFlowStore.getState().loadRound(round);
        render(<PrintView />);
        expect(screen.getAllByText("1AC CX Question")).toHaveLength(1);
    });
});
