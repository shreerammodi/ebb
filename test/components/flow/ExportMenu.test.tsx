import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import ExportMenu from "@/components/flow/ExportMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.mock("@/lib/persistence/flowIo", () => ({ downloadFlowFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({
    downloadXlsx: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    useFlowStore.getState().loadRound(makeFlowRound({ role: "aff" }));
});

describe("ExportMenu", () => {
    it("opens on click and exposes the two formats", async () => {
        const user = userEvent.setup();
        render(
            <TooltipProvider>
                <ExportMenu />
            </TooltipProvider>,
        );
        await user.click(screen.getByTestId("export-btn"));
        expect(screen.getByTestId("export-json")).toBeInTheDocument();
        expect(screen.getByTestId("export-excel")).toBeInTheDocument();
    });

    it("JSON item invokes downloadFlowFile", async () => {
        const user = userEvent.setup();
        const { downloadFlowFile } = await import("@/lib/persistence/flowIo");
        render(
            <TooltipProvider>
                <ExportMenu />
            </TooltipProvider>,
        );
        await user.click(screen.getByTestId("export-btn"));
        await user.click(screen.getByTestId("export-json"));
        expect(downloadFlowFile).toHaveBeenCalled();
    });

    it("Excel item invokes downloadXlsx", async () => {
        const user = userEvent.setup();
        const { downloadXlsx } = await import("@/lib/export/xlsx");
        render(
            <TooltipProvider>
                <ExportMenu />
            </TooltipProvider>,
        );
        await user.click(screen.getByTestId("export-btn"));
        await user.click(screen.getByTestId("export-excel"));
        expect(downloadXlsx).toHaveBeenCalled();
    });
});
