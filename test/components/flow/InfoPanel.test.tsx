import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";

import InfoPanel from "@/components/flow/InfoPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

function renderInfoPanel() {
    return render(
        <TooltipProvider>
            <InfoPanel />
        </TooltipProvider>,
    );
}

describe("InfoPanel", () => {
    beforeEach(() => {
        useFlowStore.getState().loadRound(makeFlowRound({}));
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

    it("renders no RFD textarea; RFD lives in the drawer", () => {
        renderInfoPanel();
        expect(screen.queryByTestId("scout-rfd")).toBeNull();
        // The vote buttons remain under Decision.
        expect(screen.getByTestId("scout-vote-aff")).toBeInTheDocument();
    });
});

// The round's date is a native date input rather than a calendar component, so
// what it stores is the browser's `yyyy-mm-dd`, which is the shape the flow file
// already held. These pin the store round trip and the clear, because a field
// that quietly stops writing looks exactly like one nobody has typed into yet.
describe("the round date", () => {
    beforeEach(() => {
        useFlowStore.getState().loadRound(makeFlowRound({}));
        useFlowStore.getState().setInfoOpen(true);
    });

    it("writes the date a debater picks", async () => {
        renderInfoPanel();
        const field = screen.getByTestId("scout-date");

        await userEvent.type(field, "2026-03-14");

        expect(useFlowStore.getState().round!.scouting.date).toBe("2026-03-14");
    });

    it("shows the date the round already carries", () => {
        useFlowStore.getState().setScouting({ date: "2026-01-09" });
        renderInfoPanel();

        expect(screen.getByTestId("scout-date")).toHaveValue("2026-01-09");
    });

    // Cleared is absent, not an empty string: the field is optional in the flow
    // file, and an empty string would serialize as a date nobody set.
    it("drops the date rather than storing an empty one when it is cleared", async () => {
        useFlowStore.getState().setScouting({ date: "2026-01-09" });
        renderInfoPanel();

        await userEvent.clear(screen.getByTestId("scout-date"));

        expect(useFlowStore.getState().round!.scouting.date).toBeUndefined();
    });
});
