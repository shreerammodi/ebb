import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HotGrid from "@/components/flow/HotGrid";
import { executeCommand } from "@/lib/commands/commands";
import { getActiveHot } from "@/lib/grid/hotInstance";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
    useFlowStore.setState({ round: null, activeSheetId: null, splitSheetId: null });
});

describe("inserting below the last argument", () => {
    it.each([false, true])("opens a usable cell at the grid boundary: %s", async (boundary) => {
        const round = makeFlowRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        useFlowStore.setState({ round, activeSheetId: sheet.id, splitSheetId: null });
        render(<HotGrid sheetId={sheet.id} pane={1} />);
        await waitFor(() => expect(getActiveHot()).not.toBeNull());
        const hot = getActiveHot()!;
        const row = boundary ? hot.countRows() - 1 : 0;
        hot.setDataAtCell(row, 0, "argument");
        hot.selectCell(boundary ? hot.countRows() - 1 : row, 0);
        const selected = hot.getSelectedLast()![0];

        executeCommand("cell.insertBelow");

        expect(hot.getSelectedLast()).toEqual([selected + 1, 0, selected + 1, 0]);
        expect(hot.getDataAtCell(selected + 1, 0)).toBe("");
        hot.setDataAtCell(selected + 1, 0, "next argument");
        const saved = useFlowStore.getState().round!.sheets.find((s) => s.id === sheet.id)!;
        expect(saved.data[row][0]).toBe("argument");
        expect(saved.data[selected + 1][0]).toBe("next argument");
    });
});
