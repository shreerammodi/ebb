import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DecisionView from "@/components/flow/DecisionView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.mock("@/lib/grid/hotInstance", () => ({ focusActiveHot: vi.fn() }));

function renderView() {
    return render(
        <TooltipProvider>
            <DecisionView />
        </TooltipProvider>,
    );
}

let round: FlowRound;

beforeEach(() => {
    round = makeFlowRound({});
    round.scouting.decision = { rfd: "aff on the deficit" };
    // The aff sheet runs 1AC 1NC 2AC Block 1AR 2NR 2AR.
    round.sheets[1].title = "Case";
    round.sheets[1].data = [["inherency", null, null, null, null, "case outweighs", "extend"]];
    round.sheets[1].meta = { "0,6": { bold: true } };
    useFlowStore.getState().loadRound(round);
    useFlowStore.setState({ contacts: {} });
});

describe("DecisionView", () => {
    it("lays out a sheet's last rebuttals and leaves its earlier speeches out", () => {
        renderView();
        const panel = screen.getByTestId(`decision-panel-${round.sheets[1].id}`);
        expect(within(panel).getByText("2NR")).toBeInTheDocument();
        expect(within(panel).getByText("2AR")).toBeInTheDocument();
        expect(within(panel).getByText("case outweighs")).toBeInTheDocument();
        expect(within(panel).getByText("extend")).toHaveClass("flow-bold");
        expect(panel.textContent).not.toContain("inherency");
        expect(panel.textContent).not.toContain("1AC");
    });

    it("hides and shows sheets by hand", async () => {
        renderView();
        const cx = round.sheets[0];
        const caseSheet = round.sheets[1];
        // The empty cross-ex sheet starts in the hidden list.
        expect(screen.queryByTestId(`decision-panel-${cx.id}`)).toBeNull();

        await userEvent.click(screen.getByTestId(`decision-show-${cx.id}`));
        expect(screen.getByTestId(`decision-panel-${cx.id}`)).toBeInTheDocument();

        await userEvent.click(screen.getByTestId(`decision-hide-${caseSheet.id}`));
        expect(screen.queryByTestId(`decision-panel-${caseSheet.id}`)).toBeNull();
        expect(screen.getByTestId(`decision-show-${caseSheet.id}`)).toBeInTheDocument();
    });

    it("carries an RFD editor seeded with the stored notes", () => {
        const { container } = renderView();
        const rfd = screen.getByTestId("decision-rfd");
        expect(rfd.querySelector(".cm-editor")).not.toBeNull();
        expect(container.textContent).toContain("aff on the deficit");
    });
});
