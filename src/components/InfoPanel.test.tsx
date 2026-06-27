import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormatByKey } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import InfoPanel from "./InfoPanel";

describe("InfoPanel", () => {
    beforeEach(() => {
        useRoundStore.getState().createRound({ role: "aff", format: makeFormatByKey("policy") });
        useRoundStore.getState().setInfoOpen(true);
    });

    it("edits aff school", async () => {
        render(<InfoPanel />);
        await userEvent.type(screen.getByTestId("scout-affSchool"), "Westwood");
        expect(useRoundStore.getState().round!.scouting.affSchool).toBe("Westwood");
    });

    it("renders nothing when closed", () => {
        useRoundStore.getState().setInfoOpen(false);
        const { container } = render(<InfoPanel />);
        expect(container.firstChild).toBeNull();
    });

    it("sets a vote, and clicking the selected side again clears it", async () => {
        render(<InfoPanel />);
        const aff = screen.getByTestId("scout-vote-aff");

        await userEvent.click(aff);
        expect(useRoundStore.getState().round!.scouting.decision?.vote).toBe("aff");
        expect(aff).toHaveAttribute("aria-pressed", "true");

        // Clicking the selected side again returns to undecided.
        await userEvent.click(aff);
        expect(useRoundStore.getState().round!.scouting.decision?.vote).toBeUndefined();
    });
});
