import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HotGrid from "@/components/flow/HotGrid";
import { getActiveHot } from "@/lib/grid/hotInstance";
import { makeFlowRound, makeFlowSheet } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.setConfig({ testTimeout: 30_000 });

const round = makeFlowRound();
const flowId = round.sheets.find((s) => s.kind !== "cx")!.id;

/** Whether a wheel dispatched on `target` reaches Handsontable's root listener. */
function reachesHot(root: HTMLElement, target: Element): boolean {
    let seen = false;
    const spy = () => {
        seen = true;
    };
    root.addEventListener("wheel", spy);
    target.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true }));
    root.removeEventListener("wheel", spy);
    return seen;
}

describe("wheel over the grid", () => {
    it("scrolls the body natively and leaves the header to Handsontable", async () => {
        useFlowStore.setState({ round, activeSheetId: flowId, splitSheetId: null });
        render(<HotGrid sheetId={flowId} pane={1} />);
        await waitFor(() => expect(getActiveHot()).not.toBeNull());
        const hot = getActiveHot()!;

        const cell = hot.getCell(0, 0)!;
        expect(cell.closest(".ht_master .wtHolder")).not.toBeNull();
        expect(reachesHot(hot.rootElement, cell)).toBe(false);

        const header = hot.rootElement.querySelector(".ht_clone_top .wtHolder");
        expect(header).not.toBeNull();
        expect(reachesHot(hot.rootElement, header!)).toBe(true);
    });
});

describe("row heights on a sheet load", () => {
    it("measures every row of the incoming sheet, not just the ones on screen", async () => {
        const other = makeFlowSheet({ title: "2.", group: "neg", order: 1 });
        const otherId = other.id;
        const withTwo = { ...round, sheets: [...round.sheets, other] };
        useFlowStore.setState({ round: withTwo, activeSheetId: flowId, splitSheetId: null });
        const { rerender } = render(<HotGrid sheetId={flowId} pane={1} />);
        await waitFor(() => expect(getActiveHot()).not.toBeNull());
        // Handsontable runs one full pass at init by itself; the switch below
        // swaps data through updateData, which it does not re-measure on.
        const spy = vi.spyOn(getActiveHot()!.getPlugin("autoRowSize"), "recalculateAllRowsHeight");
        useFlowStore.setState({ activeSheetId: otherId });
        rerender(<HotGrid sheetId={otherId} pane={1} />);
        await waitFor(() => expect(spy).toHaveBeenCalled());
    });
});
