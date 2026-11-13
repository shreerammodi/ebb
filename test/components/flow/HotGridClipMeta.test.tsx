import { render, waitFor } from "@testing-library/react";
import type Handsontable from "handsontable/base";
import { afterEach, describe, expect, it, vi } from "vitest";

import HotGrid from "@/components/flow/HotGrid";
import { resetClip } from "@/lib/grid/clipMeta";
import { getActiveHot } from "@/lib/grid/hotInstance";
import { resetMetaUndo } from "@/lib/grid/metaUndo";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
    useFlowStore.setState({ round: null, activeSheetId: null, splitSheetId: null });
    resetClip();
    resetMetaUndo();
});

/** A clipboard event Handsontable's own handlers accept, sharing one store. */
function clipboardEvent(store: Map<string, string>) {
    return {
        target: document.body,
        composedPath: () => [document.body],
        preventDefault: () => {},
        clipboardData: {
            setData: (type: string, value: string) => store.set(type, value),
            getData: (type: string) => store.get(type) ?? "",
        },
    };
}

type ClipboardPlugin = {
    onCopy(e: unknown): void;
    onCut(e: unknown): void;
    onPaste(e: unknown): void;
};

async function mount(insertPaste: boolean) {
    const round = makeFlowRound();
    const sheet = round.sheets.find((s) => s.kind !== "cx")!;
    sheet.data = [["Card\nwith a second line"], ["plain"]];
    sheet.meta = { "0,0": { card: true } };
    useFlowStore.setState({ round, activeSheetId: sheet.id, splitSheetId: null, insertPaste });
    render(<HotGrid sheetId={sheet.id} pane={1} />);
    await waitFor(() => expect(getActiveHot()).not.toBeNull());
    const hot = getActiveHot()! as Handsontable;
    hot.listen();
    const plugin = hot.getPlugin("copyPaste") as unknown as ClipboardPlugin;
    const saved = () => useFlowStore.getState().round!.sheets.find((s) => s.id === sheet.id)!;
    return { hot, plugin, saved };
}

describe("pasting a decorated cell", () => {
    it.each([false, true])("carries a cut card to where it lands (insert: %s)", async (insert) => {
        const { hot, plugin, saved } = await mount(insert);
        const clip = new Map<string, string>();

        hot.selectCell(0, 0);
        plugin.onCut(clipboardEvent(clip));
        hot.selectCell(3, 0);
        plugin.onPaste(clipboardEvent(clip));

        expect(saved().data[3][0]).toMatch(/^Card\r?\nwith a second line$/);
        expect(saved().meta["3,0"]).toEqual({ card: true });
        expect(saved().meta["0,0"]).toBeUndefined();

        const undo = hot.getPlugin("undoRedo");
        undo.undo();
        expect(saved().meta["3,0"]).toBeUndefined();
        undo.undo();
        expect(saved().meta["0,0"]).toEqual({ card: true });
    });

    it("copies a card without unmarking the original", async () => {
        const { hot, plugin, saved } = await mount(false);
        const clip = new Map<string, string>();

        hot.selectCell(0, 0);
        plugin.onCopy(clipboardEvent(clip));
        hot.selectCell(1, 0);
        plugin.onPaste(clipboardEvent(clip));

        expect(saved().meta["0,0"]).toEqual({ card: true });
        expect(saved().meta["1,0"]).toEqual({ card: true });
    });

    it("pastes text from elsewhere plain", async () => {
        const { hot, plugin, saved } = await mount(false);
        const clip = new Map<string, string>();

        hot.selectCell(0, 0);
        plugin.onCopy(clipboardEvent(clip));
        hot.selectCell(1, 0);
        plugin.onPaste(clipboardEvent(new Map([["text/plain", "from a browser"]])));

        expect(saved().data[1][0]).toBe("from a browser");
        expect(saved().meta["1,0"]).toBeUndefined();
    });
});
