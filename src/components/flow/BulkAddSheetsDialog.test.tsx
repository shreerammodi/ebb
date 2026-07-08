import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import BulkAddSheetsDialog from "./BulkAddSheetsDialog";

describe("BulkAddSheetsDialog", () => {
    beforeEach(() => {
        useFlowStore.getState().loadRound(makeFlowRound("aff"));
        useFlowStore.getState().setBulkAddOpen(true);
    });

    it("renders nothing when closed", () => {
        useFlowStore.getState().setBulkAddOpen(false);
        const { container } = render(<BulkAddSheetsDialog />);
        expect(container.firstChild).toBeNull();
    });

    it("adds the entered counts of each side and closes", async () => {
        // Fresh aff round: CX + one aff flow sheet.
        const before = useFlowStore.getState().round!.sheets.length;
        render(<BulkAddSheetsDialog />);

        const aff = screen.getByTestId("bulk-add-aff");
        const neg = screen.getByTestId("bulk-add-neg");
        await userEvent.clear(aff);
        await userEvent.type(aff, "2");
        await userEvent.clear(neg);
        await userEvent.type(neg, "3");
        await userEvent.click(screen.getByTestId("bulk-add-submit"));

        const sheets = useFlowStore.getState().round!.sheets;
        expect(sheets).toHaveLength(before + 5);
        expect(sheets.filter((s) => s.kind === "flow" && s.group === "aff")).toHaveLength(3);
        expect(sheets.filter((s) => s.kind === "flow" && s.group === "neg")).toHaveLength(3);
        expect(useFlowStore.getState().bulkAddOpen).toBe(false);
    });
});
