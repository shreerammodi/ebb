import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import InfoPanel from "./InfoPanel";

function renderInfoPanel() {
    return render(
        <TooltipProvider>
            <InfoPanel />
        </TooltipProvider>,
    );
}

describe("InfoPanel", () => {
    beforeEach(() => {
        useFlowStore.getState().loadRound(makeFlowRound("aff"));
        useFlowStore.getState().setInfoOpen(true);
    });

    it("edits aff school", async () => {
        renderInfoPanel();
        await userEvent.type(screen.getByTestId("scout-affSchool"), "Westwood");
        expect(useFlowStore.getState().round!.scouting.affSchool).toBe("Westwood");
    });

    it("renders nothing when closed", () => {
        useFlowStore.getState().setInfoOpen(false);
        const { container } = renderInfoPanel();
        expect(container.firstChild).toBeNull();
    });

    it("sets a vote, and clicking the selected side again clears it", async () => {
        renderInfoPanel();
        const aff = screen.getByTestId("scout-vote-aff");

        await userEvent.click(aff);
        expect(useFlowStore.getState().round!.scouting.decision?.vote).toBe("aff");
        expect(aff).toHaveAttribute("aria-pressed", "true");

        // Clicking the selected side again returns to undecided.
        await userEvent.click(aff);
        expect(useFlowStore.getState().round!.scouting.decision?.vote).toBeUndefined();
    });
});
