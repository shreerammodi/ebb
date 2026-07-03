import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

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
        useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
        useRoundStore.getState().setInfoOpen(true);
    });

    it("edits aff school", async () => {
        renderInfoPanel();
        await userEvent.type(screen.getByTestId("scout-affSchool"), "Westwood");
        expect(useRoundStore.getState().round!.scouting.affSchool).toBe("Westwood");
    });

    it("renders nothing when closed", () => {
        useRoundStore.getState().setInfoOpen(false);
        const { container } = renderInfoPanel();
        expect(container.firstChild).toBeNull();
    });

    it("sets a vote, and clicking the selected side again clears it", async () => {
        renderInfoPanel();
        const aff = screen.getByTestId("scout-vote-aff");

        await userEvent.click(aff);
        expect(useRoundStore.getState().round!.scouting.decision?.vote).toBe("aff");
        expect(aff).toHaveAttribute("aria-pressed", "true");

        // Clicking the selected side again returns to undecided.
        await userEvent.click(aff);
        expect(useRoundStore.getState().round!.scouting.decision?.vote).toBeUndefined();
    });
});
