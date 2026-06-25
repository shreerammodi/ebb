import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportMenu from "./ExportMenu";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";

vi.mock("@/lib/persistence/io", () => ({ downloadRoundFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({
    downloadXlsx: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    useRoundStore
        .getState()
        .createRound({ role: "aff", format: makeFormatByKey("policy") });
});

describe("ExportMenu", () => {
    it("opens on click and exposes the two formats", async () => {
        const user = userEvent.setup();
        render(<ExportMenu />);
        await user.click(screen.getByTestId("export-btn"));
        expect(screen.getByTestId("export-json")).toBeInTheDocument();
        expect(screen.getByTestId("export-excel")).toBeInTheDocument();
    });

    it("JSON item invokes downloadRoundFile", async () => {
        const user = userEvent.setup();
        const { downloadRoundFile } = await import("@/lib/persistence/io");
        render(<ExportMenu />);
        await user.click(screen.getByTestId("export-btn"));
        await user.click(screen.getByTestId("export-json"));
        expect(downloadRoundFile).toHaveBeenCalled();
    });

    it("Excel item invokes downloadXlsx", async () => {
        const user = userEvent.setup();
        const { downloadXlsx } = await import("@/lib/export/xlsx");
        render(<ExportMenu />);
        await user.click(screen.getByTestId("export-btn"));
        await user.click(screen.getByTestId("export-excel"));
        expect(downloadXlsx).toHaveBeenCalled();
    });
});
