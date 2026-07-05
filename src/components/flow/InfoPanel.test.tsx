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

    it("renders no RFD textarea; RFD lives in the drawer", () => {
        renderInfoPanel();
        expect(screen.queryByTestId("scout-rfd")).toBeNull();
        // The vote buttons remain under Decision.
        expect(screen.getByTestId("scout-vote-aff")).toBeInTheDocument();
    });

    it("autofills fields from a pasted pairing", async () => {
        renderInfoPanel();
        const box = screen.getByTestId("scout-paste");
        const text = `Round 5 of Varsity Lincoln-Douglas
Competitors
AFF Lynbrook VV
Vikrant : he/him/his
NEG Lynbrook OM
Access Your Ballot
Judging
Shreeram Modi
he/him`;
        // Simulate a paste of the pairing text.
        box.focus();
        await userEvent.paste(text);

        const sc = useFlowStore.getState().round!.scouting;
        expect(sc.round).toBe("Round 5");
        expect(sc.affSchool).toBe("Lynbrook");
        expect(sc.aff.first).toEqual({ first: "Vikrant", last: "V" });
        expect(sc.negSchool).toBe("Lynbrook");
        expect(sc.judge).toBe("Shreeram Modi");
    });

    it("merges an aff-only pasted pairing without wiping an already-entered neg debater", async () => {
        useFlowStore.getState().setScouting({
            neg: { first: { first: "Existing", last: "Partner" }, second: { first: "", last: "" } },
        });
        renderInfoPanel();
        const box = screen.getByTestId("scout-paste");
        const text = `Round 1 of Varsity Lincoln-Douglas
Competitors
AFF Lynbrook OM`;
        box.focus();
        await userEvent.paste(text);
        // The sheet already has a neg debater, so replacing is confirmed first.
        await userEvent.click(screen.getByTestId("scout-paste-confirm"));

        const sc = useFlowStore.getState().round!.scouting;
        expect(sc.affSchool).toBe("Lynbrook");
        expect(sc.aff.first).toEqual({ first: "O", last: "M" });
        expect(sc.neg.first).toEqual({ first: "Existing", last: "Partner" });
    });

    it("asks before replacing existing info and applies only on confirm", async () => {
        useFlowStore.getState().setScouting({ affSchool: "Oldschool" });
        renderInfoPanel();
        const box = screen.getByTestId("scout-paste");
        box.focus();
        await userEvent.paste(`Round 3 of Varsity Lincoln-Douglas
Competitors
AFF Lynbrook VV
NEG Lynbrook OM`);

        // Nothing changes until the replacement is confirmed.
        expect(useFlowStore.getState().round!.scouting.affSchool).toBe("Oldschool");
        await userEvent.click(screen.getByTestId("scout-paste-confirm"));
        expect(useFlowStore.getState().round!.scouting.affSchool).toBe("Lynbrook");
    });

    it("cancels a pending pairing without changing existing info", async () => {
        useFlowStore.getState().setScouting({ affSchool: "Oldschool" });
        renderInfoPanel();
        const box = screen.getByTestId("scout-paste");
        box.focus();
        await userEvent.paste(`Round 3 of Varsity Lincoln-Douglas
Competitors
AFF Lynbrook VV`);
        await userEvent.click(screen.getByTestId("scout-paste-cancel"));

        expect(screen.queryByTestId("scout-paste-confirm")).toBeNull();
        expect(useFlowStore.getState().round!.scouting.affSchool).toBe("Oldschool");
    });
});
