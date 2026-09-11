import { act, render, waitFor } from "@testing-library/react";
import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HotGrid, { applyMeta, collectMeta } from "@/components/flow/HotGrid";
import { projectDoc, seedDoc } from "@/lib/collab/doc";
import { applyOp, type OpContext } from "@/lib/collab/ops";
import { clearReplica, getReplica, seedReplica } from "@/lib/collab/replica";
import { executeCommand } from "@/lib/commands/commands";
import { createClock } from "@/lib/collab/stamp";
import { gridCol, toModelCol } from "@/lib/grid/colSpace";
import { trimGrid } from "@/lib/grid/codec";
import { getActiveHot, getActiveSpacers } from "@/lib/grid/hotInstance";
import { applyRemote } from "@/lib/grid/remoteBridge";
import { makeFlowRound, makeFlowSheet, type CellMeta, type CellSource } from "@/lib/model/flow";
import { useCollabStore } from "@/lib/store/useCollabStore";
import { useFlowStore } from "@/lib/store/useFlowStore";

registerAllModules();

// Every test outside the first describe mounts a real Handsontable and waits
// out one or more full repaints; flipping alignment mid-test pays for two. On
// a quiet machine that is a second or so, but the whole suite running in
// parallel stretches it several times over, so this file gets a ceiling that
// reflects the work rather than one tuned to an idle CPU.
vi.setConfig({ testTimeout: 30_000 });

const SRC: CellSource = {
    app: "cardmirror",
    token: "cmsrc1abc",
    key: "doc1|perm solves",
    title: "AT - Cap K",
};

/**
 * A policy round with alignment on, whose aff sheet opens it and so leads with
 * nothing, and whose neg sheet leads with one spacer for the speech it skips.
 * Both carry three cells of text, so a column lost or gained is visible.
 */
function alignedPair() {
    const round = makeFlowRound();
    const aff = round.sheets[1];
    aff.data = [["kritik", "perm", "extend"]];
    const neg = makeFlowSheet({ title: "2.", group: "neg", order: 1 });
    neg.data = [["link", "impact", "block"]];
    round.sheets.push(neg);
    useFlowStore.setState({
        round,
        activeSheetId: aff.id,
        splitSheetId: null,
        alignSpeeches: true,
    });
    return { round, aff, neg };
}

/** The pane's instance, once the first load has published it. */
function mounted() {
    return waitFor(() => {
        const h = getActiveHot();
        expect(h).not.toBeNull();
        return h!;
    });
}

/** Opens the editor on a cell and leaves a half-typed word in it. */
function typeInto(hot: Handsontable, row: number, col: number, text: string) {
    hot.selectCell(row, col);
    hot.getActiveEditor()!.beginEditing();
    const input = document.querySelector<HTMLTextAreaElement>("textarea.handsontableInput");
    expect(input).not.toBeNull();
    input!.value = text;
}

/**
 * The two halves of a sheet switch, driven against a real grid: the pane saves
 * the outgoing sheet with collectMeta and loads the incoming one with applyMeta.
 */
describe("collectMeta / applyMeta", () => {
    let hot: Handsontable | null = null;

    afterEach(() => {
        hot?.destroy();
        hot = null;
    });

    function makeHot() {
        const el = document.createElement("div");
        document.body.appendChild(el);
        hot = new Handsontable(el, {
            data: [
                ["a", "b"],
                ["c", "d"],
            ],
            licenseKey: "non-commercial-and-evaluation",
        });
        return hot;
    }

    it("round-trips provenance and decorations through a sheet switch", () => {
        const h = makeHot();
        h.setCellMeta(0, 0, "className", "flow-card");
        h.setCellMeta(0, 0, "source", SRC);
        h.setCellMeta(1, 1, "source", SRC);

        const saved = collectMeta(h);
        expect(saved).toEqual({
            "0,0": { card: true, source: SRC },
            "1,1": { source: SRC },
        });

        // Switch away to a bare sheet, then back.
        applyMeta(h, {}, saved);
        expect(h.getCellMeta(0, 0).className).toBe("");
        expect(h.getCellMeta(0, 0).source).toBeUndefined();
        expect(h.getCellMeta(1, 1).source).toBeUndefined();

        applyMeta(h, saved, {});
        expect(h.getCellMeta(0, 0).className).toBe("flow-card");
        expect(h.getCellMeta(0, 0).source).toEqual(SRC);
        expect(h.getCellMeta(1, 1).source).toEqual(SRC);
        expect(collectMeta(h)).toEqual(saved);
    });

    it("clears provenance a cell keeps in the outgoing sheet but not the incoming one", () => {
        const h = makeHot();
        h.setCellMeta(0, 0, "className", "flow-bold");
        h.setCellMeta(0, 0, "source", SRC);

        const prev: Record<string, CellMeta> = { "0,0": { bold: true, source: SRC } };
        // The same cell is decorated in the incoming sheet, so the prevMeta pass
        // skips it; only the inject pass can strip the stale provenance.
        applyMeta(h, { "0,0": { bold: true } }, prev);

        expect(h.getCellMeta(0, 0).className).toBe("flow-bold");
        expect(h.getCellMeta(0, 0).source).toBeUndefined();
    });

    it("scans the whole grid for orphaned provenance when the outgoing sheet is gone", () => {
        const h = makeHot();
        h.setCellMeta(1, 0, "className", "flow-highlight");
        h.setCellMeta(1, 0, "source", SRC);
        h.setCellMeta(0, 1, "source", SRC);

        applyMeta(h, {}, null);

        expect(h.getCellMeta(1, 0).className).toBe("");
        expect(h.getCellMeta(1, 0).source).toBeUndefined();
        expect(h.getCellMeta(0, 1).source).toBeUndefined();
        expect(collectMeta(h)).toEqual({});
    });
});

describe("argument extension", () => {
    afterEach(() => {
        clearReplica();
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            alignSpeeches: false,
        });
    });

    it("undoes and redoes one complete extension with metadata", async () => {
        const round = makeFlowRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        sheet.data = [
            ["tag", "neg", "destination"],
            ["warrant", null, null],
            [null, null, null],
            [null, null, null],
        ];
        sheet.meta = {
            "0,0": { bold: true, kicked: true, source: SRC },
            "0,2": { highlight: true },
        };
        useFlowStore.getState().loadRound(round, { activeSheetId: sheet.id });
        useFlowStore.setState({ splitSheetId: null, alignSpeeches: false });
        render(<HotGrid sheetId={sheet.id} pane={1} />);
        const hot = await mounted();
        hot.selectCells([[0, 0, 1, 0]]);
        const expectReplicaMatchesGrid = () => {
            const local = useFlowStore
                .getState()
                .round!.sheets.find((candidate) => candidate.id === sheet.id)!;
            const projected = projectDoc(getReplica()!, useFlowStore.getState().round!).sheets.find(
                (candidate) => candidate.id === sheet.id,
            )!;
            const localData = trimGrid(local.data);
            const projectedData = trimGrid(projected.data);
            const width = [...localData, ...projectedData].reduce(
                (widest, row) => Math.max(widest, row.length),
                0,
            );
            const rectangle = (data: (string | null)[][]) =>
                data.map((row) =>
                    Array.from({ length: width }, (_, col) => row[col] ?? null),
                );
            expect(rectangle(projectedData)).toEqual(rectangle(localData));
            expect(projected.meta).toEqual(local.meta);
        };

        act(() => executeCommand("cell.extend"));
        expect(hot.getDataAtCell(0, 2)).toBe("tag");
        expect(hot.getDataAtCell(2, 2)).toBe("destination");
        expect(hot.getCellMeta(0, 2).className).toBe("flow-bold");
        expectReplicaMatchesGrid();

        act(() => executeCommand("edit.undo"));
        expect(hot.getDataAtCell(0, 2)).toBe("destination");
        expect(hot.getCellMeta(0, 2).className).toBe("flow-highlight");
        expectReplicaMatchesGrid();

        act(() => executeCommand("edit.redo"));
        expect(hot.getDataAtCell(0, 2)).toBe("tag");
        expect(hot.getDataAtCell(2, 2)).toBe("destination");
        expect(hot.getCellMeta(0, 2).className).toBe("flow-bold");
        expectReplicaMatchesGrid();
    });
});

/**
 * Aligning gives a sheet one inert column per speech it does not show, so the
 * same speech lands at the same place on every sheet of the round.
 */
describe("speech alignment", () => {
    const round = makeFlowRound();
    // makeFlowRound opens a policy round with the cx sheet first and one aff
    // flow sheet after it; the round needs a neg sheet to have a padded one.
    const affSheet = round.sheets[1];
    const negSheet = makeFlowSheet({ title: "2.", group: "neg", order: 1 });
    round.sheets.push(negSheet);

    afterEach(() => {
        useFlowStore.setState({
            alignSpeeches: false,
            round: null,
            activeSheetId: null,
            splitSheetId: null,
        });
    });

    async function mount(sheetId: string, alignSpeeches: boolean) {
        useFlowStore.setState({ round, activeSheetId: sheetId, splitSheetId: null, alignSpeeches });
        render(<HotGrid sheetId={sheetId} pane={1} />);
        return await waitFor(() => {
            const h = getActiveHot();
            expect(h).not.toBeNull();
            return h!;
        });
    }

    it("leads a neg sheet with the speech that opens the round", async () => {
        const hot = await mount(negSheet.id, true);
        expect(hot.countCols()).toBe(7);
        expect(hot.getColHeader(0)).toBe("1AC");
        expect(hot.getColHeader(1)).toBe("1NC");
    });

    it("leaves the sheet that opens the round unpadded", async () => {
        const hot = await mount(affSheet.id, true);
        expect(hot.getColHeader(0)).toBe("1AC");
        expect(hot.countCols()).toBe(7);
    });

    it("adds no column while the setting is off", async () => {
        const hot = await mount(negSheet.id, false);
        expect(hot.countCols()).toBe(6);
        expect(hot.getColHeader(0)).toBe("1NC");
    });

    it("leaves a cx sheet unpadded, since its columns are periods", async () => {
        const hot = await mount(round.sheets[0].id, true);
        expect(hot.getColHeader(0)).toBe("Question");
    });

    it("greys the spacer and inks it with its own speech's side", async () => {
        const hot = await mount(negSheet.id, true);
        expect(hot.getCell(0, 0)!.classList.contains("cell-spacer")).toBe(true);
        expect(hot.getCell(0, 0)!.classList.contains("cell-aff")).toBe(true);
        expect(hot.getCell(0, 1)!.classList.contains("cell-spacer")).toBe(false);
    });

    it("writes a cell into the sheet's own column, not the padded one", async () => {
        const hot = await mount(negSheet.id, true);
        hot.setDataAtCell(0, 1, "extend");
        const saved = useFlowStore.getState().round!.sheets.find((s) => s.id === negSheet.id)!;
        expect(saved.data[0][0]).toBe("extend");
    });

    it("holds the cursor on its own cell when the setting is flipped", async () => {
        const hot = await mount(negSheet.id, true);
        // 2AC: the sheet's second cell, one right of the spacer.
        hot.selectCell(1, 2);

        act(() => useFlowStore.setState({ alignSpeeches: false }));
        await waitFor(() => expect(hot.countCols()).toBe(6));
        expect(hot.getSelectedLast()).toEqual([1, 1, 1, 1]);

        act(() => useFlowStore.setState({ alignSpeeches: true }));
        await waitFor(() => expect(hot.countCols()).toBe(7));
        expect(hot.getSelectedLast()).toEqual([1, 2, 1, 2]);
    });

    it("keeps the cursor on its own cell when the setting is flipped", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 2);

        act(() => useFlowStore.setState({ alignSpeeches: false }));
        await waitFor(() => expect(getActiveHot()!.countCols()).toBe(6));
        // Read back through the registry rather than the handle, because that
        // is where a command finds the grid, and it is the pair that has to
        // hold: the same speech, one column left, because the pad went with
        // it, and a published count that converts it back to the cell it was.
        const col = getActiveHot()!.getSelectedRangeLast()!.highlight.col!;
        expect(col).toBe(1);
        expect(toModelCol(gridCol(col), getActiveSpacers())).toBe(1);
    });

    it("refuses a write into a spacer", async () => {
        const hot = await mount(negSheet.id, true);
        expect(hot.getCellMeta(0, 0).readOnly).toBe(true);
        expect(hot.getCellMeta(0, 1).readOnly).toBeFalsy();
    });

    it("lands a click on the spacer in the sheet's own first cell", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 1);
        hot.getCell(0, 0)!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(1);
    });

    it("lands a click on the spacer's header past the pad too", async () => {
        const hot = await mount(negSheet.id, true);
        // A header click arrives with a negative row, so it takes the same
        // redirect as a cell click rather than a row-aware one. The header is
        // found by its coordinates because the rendered range starts wherever
        // the viewport does, not always at the first column.
        const th = [...hot.rootElement.querySelectorAll(".ht_master thead th")].find(
            (el) => hot.getCoords(el as HTMLTableCellElement)?.col === 0,
        )!;
        th.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(hot.getSelectedLast()).toEqual([-1, 1, hot.countRows() - 1, 1]);
    });

    it("stops a leftward drag at the sheet's own first column", async () => {
        const hot = await mount(negSheet.id, true);
        // A drag is a mousedown that keeps going: the mousedown lands on the
        // sheet's own column, and only the mouseover carries the range left.
        // Handsontable drops a mouseover the pointer did not move for, so the
        // two events have to sit at different coordinates.
        hot.getCell(0, 1)!.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 30 }),
        );
        hot.getCell(0, 0)!.dispatchEvent(
            new MouseEvent("mouseover", { bubbles: true, clientX: 40, clientY: 30 }),
        );
        expect(hot.getSelectedRangeLast()!.to.col).toBe(1);
    });

    it("keeps the cursor out of the spacer on arrow-left", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 1);
        hot.rootElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
        );
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(1);
    });

    it("stops a shift-extend at the sheet's own first column", async () => {
        const hot = await mount(negSheet.id, true);
        // The anchor stays at grid column 3 while the moving edge walks left,
        // so the guard has to watch the edge rather than the highlight.
        hot.selectCell(0, 3);
        for (let i = 0; i < 3; i++) {
            hot.rootElement.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowLeft",
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
        const range = hot.getSelectedRangeLast()!;
        expect(range.highlight.col).toBe(3);
        expect(range.to.col).toBe(1);
    });

    it("stops a Cmd+Left jump at the sheet's own first column", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 3);
        hot.rootElement.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "ArrowLeft",
                metaKey: true,
                bubbles: true,
                cancelable: true,
            }),
        );
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(1);
    });

    /** Handsontable's own key, so the padded pane owes it the same answer. */
    function press(hot: Handsontable, key: string, mods: Partial<KeyboardEventInit> = {}) {
        hot.rootElement.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }),
        );
    }

    it("lands Home on the sheet's own first column", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 3);
        press(hot, "Home");
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(1);
    });

    it("still lands Home on the first column when there is no pad", async () => {
        const hot = await mount(negSheet.id, false);
        hot.selectCell(0, 3);
        press(hot, "Home");
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(0);
    });

    it("stops a Shift+Home extend at the sheet's own first column", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 3);
        press(hot, "Home", { shiftKey: true });
        const range = hot.getSelectedRangeLast()!;
        expect(range.highlight.col).toBe(3);
        expect(range.to.col).toBe(1);
    });

    it("lands Ctrl+Home on the first row of the sheet's own first column", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(2, 3);
        press(hot, "Home", { ctrlKey: true });
        const highlight = hot.getSelectedRangeLast()!.highlight;
        expect([highlight.row, highlight.col]).toEqual([0, 1]);
    });

    it("starts a select-all past the pad", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 2);
        press(hot, "a", { ctrlKey: true });
        expect(hot.getSelectedLast()).toEqual([0, 1, hot.countRows() - 1, hot.countCols() - 1]);
    });

    it("starts the headers select-all past the pad too", async () => {
        const hot = await mount(negSheet.id, true);
        hot.selectCell(0, 2);
        press(hot, " ", { ctrlKey: true, shiftKey: true });
        expect(hot.getSelectedLast()).toEqual([0, 1, hot.countRows() - 1, hot.countCols() - 1]);
    });
});

/**
 * Ctrl/Meta+Arrow is the grid's Excel-style jump until a debater binds a
 * command to it. Handsontable's grid context answers the same chord, so the
 * pane has to run the command itself and swallow the keystroke: a command
 * left to the window keymap would fire beside a cursor that had jumped.
 */
describe("a rebound Ctrl/Meta+Arrow", () => {
    const round = makeFlowRound();
    const affSheet = round.sheets[1];
    const negSheet = makeFlowSheet({ title: "2.", group: "neg", order: 1 });
    round.sheets.push(negSheet);

    afterEach(() => {
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            alignSpeeches: false,
            keymapOverrides: {},
        });
    });

    async function mount(overrides: Record<string, string>, sheetId = affSheet.id) {
        affSheet.data = [["kritik", "perm", "extend"]];
        negSheet.data = [["link", "impact", "block"]];
        useFlowStore.setState({
            round,
            activeSheetId: sheetId,
            splitSheetId: null,
            alignSpeeches: sheetId === negSheet.id,
            keymapOverrides: overrides,
        });
        render(<HotGrid sheetId={sheetId} pane={1} />);
        return await waitFor(() => {
            const h = getActiveHot();
            expect(h).not.toBeNull();
            return h!;
        });
    }

    /** A keydown through Handsontable's own recorder, as a real one arrives. */
    function press(hot: Handsontable, key: string, mods: Partial<KeyboardEventInit> = {}) {
        hot.rootElement.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }),
        );
    }

    it("runs the bound command and leaves the cursor where it was", async () => {
        const hot = await mount({ "sheet.next": "Ctrl+ArrowRight" });
        hot.selectCell(0, 0);
        press(hot, "ArrowRight", { ctrlKey: true });
        expect(useFlowStore.getState().activeSheetId).toBe(negSheet.id);
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(0);
    });

    it("keeps the chord off the window, so the command fires once", async () => {
        const hot = await mount({ "sheet.next": "Ctrl+ArrowRight" });
        hot.selectCell(0, 0);
        let sawIt = 0;
        const count = () => {
            sawIt += 1;
        };
        window.addEventListener("keydown", count);
        press(hot, "ArrowRight", { ctrlKey: true });
        window.removeEventListener("keydown", count);
        expect(sawIt).toBe(0);
    });

    it("runs a Shift extend's binding rather than extending the range", async () => {
        const hot = await mount({ "sheet.next": "Ctrl+Shift+ArrowRight" });
        hot.selectCell(0, 0);
        press(hot, "ArrowRight", { ctrlKey: true, shiftKey: true });
        expect(useFlowStore.getState().activeSheetId).toBe(negSheet.id);
        expect(hot.getSelectedRangeLast()!.to.col).toBe(0);
    });

    it("still jumps when the chord is bound to nothing", async () => {
        const hot = await mount({});
        hot.selectCell(0, 0);
        press(hot, "ArrowRight", { ctrlKey: true });
        expect(useFlowStore.getState().activeSheetId).toBe(affSheet.id);
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(2);
    });

    it("runs the binding at the sheet's own first column too", async () => {
        // A leftward jump has nowhere to go from the column the pad ends at,
        // where the spacer guard would otherwise swallow the chord whole.
        const hot = await mount({ "sheet.prev": "Ctrl+ArrowLeft" }, negSheet.id);
        hot.selectCell(0, 1);
        press(hot, "ArrowLeft", { ctrlKey: true });
        expect(useFlowStore.getState().activeSheetId).toBe(affSheet.id);
        expect(hot.getSelectedRangeLast()!.highlight.col).toBe(1);
    });
});

/**
 * Stepping between sheets carries the platform modifier so it reaches the app
 * from inside an open cell editor. Arriving mid-word, the switch has to take
 * the word with it: the editor is closed against the sheet being left, before
 * the pane retargets, so the text lands where it was typed.
 */
describe("sheet switch under an open editor", () => {
    afterEach(() => {
        clearReplica();
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            alignSpeeches: false,
        });
    });

    it("keeps the half-typed cell on the sheet being left", async () => {
        const round = makeFlowRound();
        const from = round.sheets[1];
        const to = makeFlowSheet({ title: "2.", group: "neg", order: 1 });
        round.sheets.push(to);
        useFlowStore.setState({ round, activeSheetId: from.id, splitSheetId: null });

        const { rerender } = render(<HotGrid sheetId={from.id} pane={1} />);
        const hot = await waitFor(() => {
            const h = getActiveHot();
            expect(h).not.toBeNull();
            return h!;
        });

        hot.selectCell(0, 0);
        hot.getActiveEditor()!.beginEditing();
        const input = document.querySelector<HTMLTextAreaElement>("textarea.handsontableInput");
        expect(input).not.toBeNull();
        input!.value = "perm solves";

        rerender(<HotGrid sheetId={to.id} pane={1} />);

        const left = useFlowStore.getState().round!.sheets.find((s) => s.id === from.id)!;
        expect(left.data[0][0]).toBe("perm solves");
    });

    /**
     * The same step with alignment on, which is what makes the two sheets
     * disagree about where the pad is. The save runs inside the switch, while
     * the grid still holds the sheet being left, so it owes that sheet the pad
     * the grid was drawn with rather than the one the next render asked for.
     */
    it("keeps every column of an unpadded sheet stepped off onto a padded one", async () => {
        const { aff, neg } = alignedPair();

        const { rerender } = render(<HotGrid sheetId={aff.id} pane={1} />);
        const hot = await mounted();
        // The aff sheet opens the round and so leads with nothing: grid column
        // 2 is its own third cell.
        typeInto(hot, 0, 2, "turn");

        rerender(<HotGrid sheetId={neg.id} pane={1} />);

        const left = useFlowStore.getState().round!.sheets.find((s) => s.id === aff.id)!;
        // The trailing null is the sheet's fourth column, still empty: nothing
        // shifted, and the sheet keeps the width the grid drew it at.
        expect(left.data[0].slice(0, 4)).toEqual(["kritik", "perm", "turn", null]);
    });

    it("keeps every column of a padded sheet stepped off onto an unpadded one", async () => {
        const { aff, neg } = alignedPair();
        useFlowStore.setState({ activeSheetId: neg.id });

        const { rerender } = render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();
        // One spacer, so grid column 3 is the neg sheet's third cell.
        typeInto(hot, 0, 3, "turn");

        rerender(<HotGrid sheetId={aff.id} pane={1} />);

        const left = useFlowStore.getState().round!.sheets.find((s) => s.id === neg.id)!;
        expect(left.data[0].slice(0, 4)).toEqual(["link", "impact", "turn", null]);
    });

    /**
     * The op the closing editor produces names a cell of the sheet being left,
     * so it is the outgoing pad that turns the reported grid column into it.
     */
    it("records the closing word against the pad the grid was drawn with", async () => {
        const { round, aff, neg } = alignedPair();
        seedReplica(round);

        const { rerender } = render(<HotGrid sheetId={aff.id} pane={1} />);
        const hot = await mounted();
        typeInto(hot, 0, 2, "turn");

        rerender(<HotGrid sheetId={neg.id} pane={1} />);

        const cells = Object.values(getReplica()!.sheets[aff.id].cells);
        expect(cells.find((c) => c.col === 2)!.text).toBe("turn");
        expect(cells.find((c) => c.col === 1)!.text).toBe("perm");
    });
});

/**
 * A decoration sits on the grid at its model column plus the pad, so both ends
 * of a load have to name the pad each side is in: the sheet being left is
 * cleared at the pad it was drawn with, the sheet arriving is injected at the
 * pad it is about to be drawn with.
 */
describe("decorations across a change of pad", () => {
    afterEach(() => {
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            alignSpeeches: false,
        });
    });

    function decoratedPair() {
        const pair = alignedPair();
        pair.neg.meta = { "0,0": { bold: true } };
        useFlowStore.setState({ activeSheetId: pair.neg.id });
        return pair;
    }

    it("takes a padded sheet's decoration off the grid when the sheet is left", async () => {
        const { aff, neg } = decoratedPair();

        const { rerender } = render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();
        // One spacer, so the neg sheet's first cell is grid column 1.
        expect(hot.getCellMeta(0, 1).className).toBe("flow-bold");

        rerender(<HotGrid sheetId={aff.id} pane={1} />);
        await waitFor(() => expect(hot.getDataAtCell(0, 0)).toBe("kritik"));

        expect(hot.getCellMeta(0, 1).className).toBe("");
        // The aff sheet never wore it, so its next save must not collect it.
        hot.setDataAtCell(0, 0, "kritik turns");
        const saved = useFlowStore.getState().round!.sheets.find((s) => s.id === aff.id)!;
        expect(saved.meta).toEqual({});
    });

    it("moves a decoration rather than doubling it when alignment is flipped", async () => {
        const { neg } = decoratedPair();

        render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();
        expect(hot.getCellMeta(0, 1).className).toBe("flow-bold");

        act(() => useFlowStore.setState({ alignSpeeches: false }));
        await waitFor(() => expect(hot.countCols()).toBe(6));

        expect(hot.getCellMeta(0, 0).className).toBe("flow-bold");
        expect(hot.getCellMeta(0, 1).className).toBe("");
        hot.setDataAtCell(0, 0, "link turns");
        const saved = useFlowStore.getState().round!.sheets.find((s) => s.id === neg.id)!;
        expect(saved.meta).toEqual({ "0,0": { bold: true } });
    });
});

/**
 * React flushes passive effects in their own task, so a partner's patch can
 * land after the render that changed the count and before the load that acts
 * on it. A sibling's layout effect stands in for that window: it runs after
 * HotGrid has rendered and before HotGrid's own effect reloads the grid.
 */
describe("a partner's patch landing between the render and the load", () => {
    afterEach(() => {
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            alignSpeeches: false,
        });
    });

    it("writes into the grid the pane is still showing", async () => {
        const { round, neg } = alignedPair();
        useFlowStore.setState({ activeSheetId: neg.id });

        let atCommit: (() => void) | null = null;
        // Subscribed to the same setting, so the flip re-renders this beside
        // the pane and its layout effect lands in the pane's own window.
        function AtCommit() {
            useFlowStore((s) => s.alignSpeeches);
            useLayoutEffect(() => atCommit?.());
            return null;
        }
        render(
            <>
                <HotGrid sheetId={neg.id} pane={1} />
                <AtCommit />
            </>,
        );
        const hot = await mounted();
        expect(hot.countCols()).toBe(7);

        let t = 5_000;
        const ctx: OpContext = { actor: "sam", clock: createClock("sam", () => t++) };
        const before = seedDoc(round);
        const after = applyOp(
            before,
            { kind: "cellText", sheetId: neg.id, col: 0, row: 0, text: "theirs" },
            ctx,
        );

        let landed: unknown[] | null = null;
        atCommit = () => {
            applyRemote(before, after);
            landed = [hot.getDataAtCell(0, 0), hot.getDataAtCell(0, 1)];
        };
        act(() => useFlowStore.setState({ alignSpeeches: false }));
        atCommit = null;

        // The grid was still carrying its pad, so the partner's first cell is
        // grid column 1 and the spacer it leads with stays empty.
        expect(landed).toEqual([null, "theirs"]);
    });
});

/**
 * A spacer refuses the editor and the sheet's own columns take it. The rule
 * that says so is consulted per cell and merged into meta Handsontable keeps,
 * so a pad that shrinks has to be able to lift the refusal it laid down, not
 * only lay it down.
 */
describe("a spacer's read-only across a change of pad", () => {
    afterEach(() => {
        useCollabStore.setState({ selfRole: "editor" });
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            alignSpeeches: false,
        });
    });

    it("frees the first column when a padded sheet is stepped off onto an unpadded one", async () => {
        const { aff, neg } = alignedPair();
        useFlowStore.setState({ activeSheetId: neg.id });

        const { rerender } = render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();
        expect(hot.getCellMeta(0, 0).readOnly).toBe(true);

        rerender(<HotGrid sheetId={aff.id} pane={1} />);
        await waitFor(() => expect(hot.getDataAtCell(0, 0)).toBe("kritik"));

        // 1AC now sits in grid column 0, and the aff sheet has no pad at all.
        expect(hot.getCellMeta(0, 0).readOnly).toBeFalsy();
    });

    it("lets the editor open on the freed column", async () => {
        const { aff, neg } = alignedPair();
        useFlowStore.setState({ activeSheetId: neg.id });

        const { rerender } = render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();
        rerender(<HotGrid sheetId={aff.id} pane={1} />);
        await waitFor(() => expect(hot.getDataAtCell(0, 0)).toBe("kritik"));

        hot.selectCell(0, 0);
        hot.getActiveEditor()!.beginEditing();
        expect(hot.getActiveEditor()!.isOpened()).toBe(true);
    });

    it("frees the first column when the setting is turned off", async () => {
        const { neg } = alignedPair();
        useFlowStore.setState({ activeSheetId: neg.id });

        render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();
        expect(hot.getCellMeta(0, 0).readOnly).toBe(true);

        act(() => useFlowStore.setState({ alignSpeeches: false }));
        await waitFor(() => expect(hot.countCols()).toBe(6));

        expect(hot.getCellMeta(0, 0).readOnly).toBeFalsy();
    });

    it("keeps a viewer's own columns read-only on a padded pane", async () => {
        const { neg } = alignedPair();
        useFlowStore.setState({ activeSheetId: neg.id });
        useCollabStore.setState({ selfRole: "viewer" });

        render(<HotGrid sheetId={neg.id} pane={1} />);
        const hot = await mounted();

        expect(hot.getCellMeta(0, 0).readOnly).toBe(true);
        expect(hot.getCellMeta(0, 1).readOnly).toBe(true);
        expect(hot.getCellMeta(0, 3).readOnly).toBe(true);
    });
});
