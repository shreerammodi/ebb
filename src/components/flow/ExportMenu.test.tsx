import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import ExportMenu from "./ExportMenu";

vi.mock("@/lib/persistence/io", () => ({ downloadRoundFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({
    downloadXlsx: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
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

    it("JSON item invokes downloadRoundFile", async () => {
        const user = userEvent.setup();
        const { downloadRoundFile } = await import("@/lib/persistence/io");
        render(
            <TooltipProvider>
                <ExportMenu />
            </TooltipProvider>,
        );
        await user.click(screen.getByTestId("export-btn"));
        await user.click(screen.getByTestId("export-json"));
        expect(downloadRoundFile).toHaveBeenCalled();
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
