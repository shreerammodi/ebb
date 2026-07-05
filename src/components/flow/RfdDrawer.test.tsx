import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { focusActiveHot } from "@/lib/grid/hotInstance";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import RfdDrawer from "./RfdDrawer";

vi.mock("@/lib/grid/hotInstance", () => ({ focusActiveHot: vi.fn() }));

function renderDrawer() {
    return render(
        <TooltipProvider>
            <RfdDrawer />
        </TooltipProvider>,
    );
}

describe("RfdDrawer", () => {
    beforeEach(() => {
        const round = makeFlowRound("judge");
        round.scouting.decision = { rfd: "aff on T" };
        useFlowStore.getState().loadRound(round);
        useFlowStore.getState().setRfdOpen(true);
    });

    it("mounts a CodeMirror editor seeded with the stored RFD", () => {
        const { container } = renderDrawer();
        expect(screen.getByTestId("rfd-drawer")).toBeInTheDocument();
        expect(container.querySelector(".cm-editor")).not.toBeNull();
        expect(container.textContent).toContain("aff on T");
    });

    it("closes the drawer when the close button is clicked", async () => {
        renderDrawer();
        await userEvent.click(screen.getByTestId("rfd-close"));
        expect(useFlowStore.getState().rfdOpen).toBe(false);
    });

    it("returns focus to the grid when it unmounts", () => {
        vi.mocked(focusActiveHot).mockClear();
        const { unmount } = renderDrawer();
        unmount();
        expect(focusActiveHot).toHaveBeenCalled();
    });
});
