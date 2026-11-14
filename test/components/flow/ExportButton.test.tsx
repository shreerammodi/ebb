import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import ExportButton from "@/components/flow/ExportButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.mock("@/lib/export/xlsx", () => ({
    saveXlsx: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    useFlowStore
        .getState()
        .loadRound(makeFlowRound({}), { docPath: "/flows/flow---harvard---round 2.ebb" });
});

describe("ExportButton", () => {
    it("exports on the first click, with no menu between, naming the flow's file", async () => {
        const user = userEvent.setup();
        const { saveXlsx } = await import("@/lib/export/xlsx");
        render(
            <TooltipProvider>
                <ExportButton />
            </TooltipProvider>,
        );
        await user.click(screen.getByTestId("export-btn"));
        expect(saveXlsx).toHaveBeenCalledWith(
            useFlowStore.getState().round,
            useFlowStore.getState().contacts,
            "/flows/flow---harvard---round 2.ebb",
        );
        expect(screen.queryByTestId("export-excel")).not.toBeInTheDocument();
    });
});
