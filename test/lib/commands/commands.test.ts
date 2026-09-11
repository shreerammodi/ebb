import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

import { toast } from "sonner";

import { projectDoc } from "@/lib/collab/doc";
import { clearReplica, getReplica, seedReplica } from "@/lib/collab/replica";
import { executeCommand } from "@/lib/commands/commands";
import { COMMANDS, EDITS_ROUND, type CommandId } from "@/lib/commands/registry";
import { BOLD_CLASS, GROUP_CLASS, HIGHLIGHT_CLASS, KICKED_CLASS } from "@/lib/grid/codec";
import { setActiveHot } from "@/lib/grid/hotInstance";
import { isMovingIn, movingBlock, revertMove } from "@/lib/grid/moveSession";
import { makeFlowRound, sortedSheets, type FlowRound } from "@/lib/model/flow";
import { useCollabStore } from "@/lib/store/useCollabStore";
import { useContactPicker } from "@/lib/store/useContactPicker";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { metaStore, selectionHot } from "../../support/fakeHot";

function loadRound() {
    const round = makeFlowRound({});
    useFlowStore.getState().loadRound(round);
    return round;
}

beforeEach(() => {
    setActiveHot(null, null, null, 0);
    clearReplica();
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        quickSwitcherOpen: false,
        paletteSeed: "",
        settingsOpen: false,
        cheatsheetOpen: false,
        infoOpen: false,
        sidebarCollapsed: false,
        renamingSheetId: null,
        sheetRange: null,
    });
});

describe("sheet commands", () => {
    it("newAff/newNeg add and activate a sheet numbered per-side", () => {
        loadRound();
        executeCommand("sheet.newNeg");
        const state = useFlowStore.getState();
        const active = state.round!.sheets.find((s) => s.id === state.activeSheetId)!;
        expect(active.title).toBe("1.");
        expect(active.group).toBe("neg");
    });

    it("next/prev step through flow sheets with clamping", () => {
        loadRound();
        const state = () => useFlowStore.getState();
        const first = state().activeSheetId!;
        executeCommand("sheet.newAff");
        const second = state().activeSheetId!;
        executeCommand("sheet.prev");
        expect(state().activeSheetId).toBe(first);
        executeCommand("sheet.prev");
        expect(state().activeSheetId).toBe(first);
        executeCommand("sheet.next");
        expect(state().activeSheetId).toBe(second);
        executeCommand("sheet.next");
        expect(state().activeSheetId).toBe(second);
    });

    it("jumpN activates the Nth flow sheet and ignores out-of-range", () => {
        loadRound();
        const state = () => useFlowStore.getState();
        const first = state().activeSheetId!;
        executeCommand("sheet.newAff");
        executeCommand("sheet.jump1");
        expect(state().activeSheetId).toBe(first);
        executeCommand("sheet.jump9");
        expect(state().activeSheetId).toBe(first);
    });

    it("rename marks the active sheet as renaming; quickSwitch opens the switcher", () => {
        loadRound();
        executeCommand("sheet.rename");
        expect(useFlowStore.getState().renamingSheetId).toBe(useFlowStore.getState().activeSheetId);
        executeCommand("sheet.quickSwitch");
        expect(useFlowStore.getState().quickSwitcherOpen).toBe(true);
    });

    it("rename targets the focused pane's sheet in split view", () => {
        loadRound();
        const first = useFlowStore.getState().activeSheetId!;
        executeCommand("sheet.newAff");
        const second = useFlowStore.getState().activeSheetId!;
        useFlowStore.setState({ activeSheetId: first, splitSheetId: second, focusedPane: 2 });
        executeCommand("sheet.rename");
        expect(useFlowStore.getState().renamingSheetId).toBe(second);
    });

    it("rename opens a collapsed sidebar so its row can be focused", () => {
        loadRound();
        useFlowStore.setState({ sidebarCollapsed: true });
        executeCommand("sheet.rename");
        expect(useFlowStore.getState().sidebarCollapsed).toBe(false);
        expect(useFlowStore.getState().renamingSheetId).toBe(useFlowStore.getState().activeSheetId);
    });
});

describe("moving and selecting a range of sheets", () => {
    /** A round of four flow sheets in order, with the first one focused. */
    function fourSheets() {
        loadRound();
        const store = useFlowStore.getState();
        const ids = [store.activeSheetId!];
        for (const title of ["B", "C", "D"]) ids.push(store.addSheet({ title, group: "aff" }));
        useFlowStore.getState().setActiveSheet(ids[0]);
        return ids;
    }

    /** The flow sheets' ids in sidebar order. */
    function order(): string[] {
        return sortedSheets(useFlowStore.getState().round!)
            .filter((s) => s.kind !== "cx")
            .map((s) => s.id);
    }

    it("slides the whole range one slot and leaves the cursor where it was", () => {
        const [a, b, c, d] = fourSheets();
        useFlowStore.getState().setSheetRange({ anchor: c, head: d });

        executeCommand("sheet.moveUp");

        expect(order()).toEqual([a, c, d, b]);
        expect(useFlowStore.getState().activeSheetId).toBe(a);
        // The two edges still name the block, so the selection follows it.
        expect(useFlowStore.getState().sheetRange).toEqual({ anchor: c, head: d });
    });

    it("reads a range built from either end the same way", () => {
        const [a, b, c, d] = fourSheets();
        useFlowStore.getState().setSheetRange({ anchor: d, head: c });

        executeCommand("sheet.moveUp");

        expect(order()).toEqual([a, c, d, b]);
    });

    it("moves the focused sheet alone when no range is live", () => {
        const [a, b, c, d] = fourSheets();
        useFlowStore.getState().setActiveSheet(b);

        executeCommand("sheet.moveDown");

        expect(order()).toEqual([a, c, b, d]);
    });

    it("stops when the block's edge reaches the end of the list", () => {
        const [a, b, c, d] = fourSheets();
        useFlowStore.getState().setSheetRange({ anchor: a, head: b });

        executeCommand("sheet.moveUp");
        expect(order()).toEqual([a, b, c, d]);

        useFlowStore.getState().setSheetRange({ anchor: c, head: d });
        executeCommand("sheet.moveDown");
        expect(order()).toEqual([a, b, c, d]);
    });

    it("never displaces cross-ex, even with the cross-ex sheet focused", () => {
        const ids = fourSheets();
        const cx = useFlowStore.getState().round!.sheets.find((s) => s.kind === "cx")!;
        useFlowStore.getState().setActiveSheet(cx.id);

        executeCommand("sheet.moveDown");

        expect(order()).toEqual(ids);
        expect(useFlowStore.getState().round!.sheets.find((s) => s.kind === "cx")!.order).toBe(-1);
    });

    it("seeds a range at the focused sheet and grows it", () => {
        const [a, b, c] = fourSheets();

        executeCommand("sheet.extendDown");
        expect(useFlowStore.getState().sheetRange).toEqual({ anchor: a, head: b });

        executeCommand("sheet.extendDown");
        expect(useFlowStore.getState().sheetRange).toEqual({ anchor: a, head: c });
    });

    it("shrinks rather than grows when the head steps back toward the anchor", () => {
        const [a, b, c] = fourSheets();
        useFlowStore.getState().setSheetRange({ anchor: a, head: c });

        executeCommand("sheet.extendUp");

        expect(useFlowStore.getState().sheetRange).toEqual({ anchor: a, head: b });
    });

    it("never changes what the grid shows", () => {
        const [a] = fourSheets();

        executeCommand("sheet.extendDown");
        executeCommand("sheet.extendDown");

        expect(useFlowStore.getState().activeSheetId).toBe(a);
    });

    it("stops at the ends", () => {
        const [a, , , d] = fourSheets();

        executeCommand("sheet.extendUp");
        expect(useFlowStore.getState().sheetRange).toBeNull();

        useFlowStore.getState().setSheetRange({ anchor: a, head: d });
        executeCommand("sheet.extendDown");
        expect(useFlowStore.getState().sheetRange).toEqual({ anchor: a, head: d });
    });

    it("opens a collapsed sidebar so the range being built is visible", () => {
        fourSheets();
        useFlowStore.setState({ sidebarCollapsed: true });

        executeCommand("sheet.extendDown");

        expect(useFlowStore.getState().sidebarCollapsed).toBe(false);
    });
});

describe("UI commands", () => {
    it("toggle and open the panels", () => {
        executeCommand("palette.open");
        executeCommand("settings.open");
        executeCommand("info.open");
        executeCommand("help.open");
        executeCommand("sidebar.toggle");
        const s = useFlowStore.getState();
        expect(s.quickSwitcherOpen).toBe(true);
        expect(s.paletteSeed).toBe(">");
        expect(s.settingsOpen).toBe(true);
        expect(s.infoOpen).toBe(true);
        expect(s.cheatsheetOpen).toBe(true);
        expect(s.sidebarCollapsed).toBe(true);
        executeCommand("help.open");
        expect(useFlowStore.getState().cheatsheetOpen).toBe(false);
    });

    it("rfd.toggle flips the drawer open state", () => {
        useFlowStore.getState().loadRound(makeFlowRound({}));
        expect(useFlowStore.getState().rfdOpen).toBe(false);

        executeCommand("rfd.toggle");
        expect(useFlowStore.getState().rfdOpen).toBe(true);

        executeCommand("rfd.toggle");
        expect(useFlowStore.getState().rfdOpen).toBe(false);
    });
});

describe("theme commands", () => {
    it("set the store's theme", () => {
        executeCommand("theme.dark");
        expect(useFlowStore.getState().theme).toBe("dark");
        executeCommand("theme.light");
        expect(useFlowStore.getState().theme).toBe("light");
        executeCommand("theme.system");
        expect(useFlowStore.getState().theme).toBe("system");
    });
});

function loadWithThreeSheets() {
    const round = makeFlowRound({});
    useFlowStore.getState().loadRound(round);
    const a = round.sheets.find((s) => s.kind !== "cx")!.id;
    const b = useFlowStore.getState().addSheet({ title: "DA", group: "neg" });
    const c = useFlowStore.getState().addSheet({ title: "CP", group: "neg" });
    useFlowStore.getState().setActiveSheet(a);
    return { a, b, c };
}

describe("split commands", () => {
    beforeEach(() => {
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            focusedPane: 1,
        });
    });

    it("split.toggle opens and closes split", () => {
        loadWithThreeSheets();
        executeCommand("split.toggle");
        expect(useFlowStore.getState().splitSheetId).not.toBeNull();
        executeCommand("split.toggle");
        expect(useFlowStore.getState().splitSheetId).toBeNull();
    });

    it("split.focusRight/Left move the focused pane", () => {
        loadWithThreeSheets();
        executeCommand("split.toggle");
        executeCommand("split.focusRight");
        expect(useFlowStore.getState().focusedPane).toBe(2);
        executeCommand("split.focusLeft");
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });

    it("sheet.next advances the focused pane relative to its own sheet", () => {
        const { a, b, c } = loadWithThreeSheets();
        executeCommand("split.toggle"); // a | b, focus 1
        executeCommand("split.focusRight"); // focus pane 2 (b)
        executeCommand("sheet.next"); // from b -> c in pane 2
        expect(useFlowStore.getState().activeSheetId).toBe(a);
        expect(useFlowStore.getState().splitSheetId).toBe(c);
    });
});

describe("grid commands", () => {
    function extensionHot(
        data: (string | null)[][],
        meta = metaStore(),
        selection = { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
    ) {
        const range = {
            highlight: { row: selection.startRow, col: selection.startCol },
            getTopLeftCorner: () => ({ row: selection.startRow, col: selection.startCol }),
            getBottomRightCorner: () => ({ row: selection.endRow, col: selection.endCol }),
        };
        const alter = vi.fn((_action: string, _index: number, amount: number) => {
            const width = data.reduce((widest, row) => Math.max(widest, row.length), 0);
            for (let index = 0; index < amount; index++) {
                data.push(Array.from({ length: width }, () => null));
            }
        });
        const setDataAtCell = vi.fn((changes: [number, number, string | null][]) => {
            for (const [row, col, value] of changes) data[row][col] = value;
        });
        const selectCells = vi.fn();
        const hot = {
            getSelectedRange: () => [range],
            countRows: () => data.length,
            countCols: () => data.reduce((widest, row) => Math.max(widest, row.length), 0),
            getDataAtCell: (row: number, col: number) => data[row]?.[col] ?? null,
            getCellMeta: meta.getCellMeta,
            setCellMeta: meta.setCellMeta,
            alter,
            setDataAtCell,
            selectCells,
            render: vi.fn(),
        };
        return { data, meta, range, hot };
    }

    it("extends one selected argument into the next same-side speech", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const source = {
            app: "cardmirror",
            token: "cmsrc1abc",
            key: "doc1|tag",
            title: "AT - Cap K",
        };
        const data = [
            ["tag", "neg-a", "dest-a"],
            [null, "neg-b", "dest-b"],
            ["warrant", null, null],
            [null, null, null],
            [null, null, null],
        ];
        const meta = metaStore([
            ["0,0", { className: `${BOLD_CLASS} ${KICKED_CLASS}`, source }],
            ["1,0", { className: GROUP_CLASS }],
        ]);
        const { hot } = extensionHot(data, meta);
        const onMutated = vi.fn();
        setActiveHot(hot as never, onMutated, sheet.id, 0);

        executeCommand("cell.extend");

        expect(data.map((row) => row[2])).toEqual(["tag", null, "warrant", "dest-a", "dest-b"]);
        expect(data.map((row) => row[0])).toEqual(["tag", null, "warrant", null, null]);
        expect(meta.at(0, 2).className).toBe(BOLD_CLASS);
        expect(meta.at(0, 2).source).toEqual(source);
        expect(hot.selectCells).toHaveBeenCalledWith([[0, 2, 2, 2]]);
        expect(onMutated).toHaveBeenCalledTimes(1);
    });

    it("adds blank capacity before extending an occupied destination tail", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const data = [
            ["tag", "neg", "destination"],
            ["warrant", null, null],
        ];
        const { hot } = extensionHot(data, metaStore(), {
            startRow: 0,
            endRow: 1,
            startCol: 0,
            endCol: 0,
        });
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(hot.alter).toHaveBeenCalledWith("insert_row_below", 1, 1, "auto");
        expect(data.map((row) => row[2])).toEqual(["tag", "warrant", "destination"]);
        expect(hot.selectCells).toHaveBeenCalledWith([[0, 2, 1, 2]]);
    });

    it("refuses selections with multiple ranges", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const { hot, range } = extensionHot([["tag", null, null]], metaStore(), {
            startRow: 0,
            endRow: 0,
            startCol: 0,
            endCol: 0,
        });
        hot.getSelectedRange = () => [range, range];
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(toast.error).toHaveBeenCalledWith("Select cells in one speech to extend");
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("refuses selections spanning multiple columns", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const { hot } = extensionHot([["tag", "neg", null]], metaStore(), {
            startRow: 0,
            endRow: 0,
            startCol: 0,
            endCol: 1,
        });
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(toast.error).toHaveBeenCalledWith("Select cells in one speech to extend");
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("refuses an all-blank run", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const { hot } = extensionHot([
            [null, null, null],
            [null, null, null],
            [null, null, null],
        ]);
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(toast.error).toHaveBeenCalledWith("Select an argument to extend");
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("refuses a cross-examination column", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind === "cx")!;
        const { hot } = extensionHot([["question"]], metaStore(), {
            startRow: 0,
            endRow: 0,
            startCol: 0,
            endCol: 0,
        });
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(toast.error).toHaveBeenCalledWith("This column is not a speech");
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("refuses an overflow column that names no speech", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const { hot } = extensionHot(
            [[null, null, null, null, null, null, null, "overflow"]],
            metaStore(),
            {
                startRow: 0,
                endRow: 0,
                startCol: 7,
                endCol: 7,
            },
        );
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(toast.error).toHaveBeenCalledWith("This column is not a speech");
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("refuses the last same-side speech", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const { hot } = extensionHot([[null, null, null, null, null, null, "final"]], metaStore(), {
            startRow: 0,
            endRow: 0,
            startCol: 6,
            endCol: 6,
        });
        setActiveHot(hot as never, vi.fn(), sheet.id, 0);

        executeCommand("cell.extend");

        expect(toast.error).toHaveBeenCalledWith("No later speech for this side");
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("leaves only blank appended capacity when capacity growth fails", () => {
        const round = makeFlowRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        sheet.data = [["stored"]];
        useFlowStore.getState().loadRound(round);
        const data = [["tag", null, "destination"]];
        const meta = metaStore([
            ["0,0", { className: BOLD_CLASS }],
            ["0,2", { className: HIGHLIGHT_CLASS }],
        ]);
        const { hot } = extensionHot(data, meta, {
            startRow: 0,
            endRow: 0,
            startCol: 0,
            endCol: 0,
        });
        hot.alter.mockImplementationOnce((_action, _index, amount) => {
            for (let index = 0; index < amount; index++) data.push([null, null, null]);
            throw new Error("capacity");
        });
        const onMutated = vi.fn();
        const beforeReplica = getReplica();
        setActiveHot(hot as never, onMutated, sheet.id, 0);

        executeCommand("cell.extend");

        expect(data).toEqual([
            ["tag", null, "destination"],
            [null, null, null],
        ]);
        expect(meta.at(0, 0).className).toBe(BOLD_CLASS);
        expect(meta.at(0, 2).className).toBe(HIGHLIGHT_CLASS);
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
        expect(hot.selectCells).not.toHaveBeenCalled();
        expect(onMutated).not.toHaveBeenCalled();
        expect(
            useFlowStore.getState().round!.sheets.find((candidate) => candidate.id === sheet.id)!
                .data,
        ).toEqual([["stored"]]);
        expect(getReplica()).toBe(beforeReplica);
        expect(toast.error).toHaveBeenCalledWith("Could not extend this argument");
    });

    it("restores destination metadata when the structured write fails", () => {
        const round = loadRound();
        const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        const destinationSource = {
            app: "cardmirror",
            token: "cmsrc1destination",
            key: "doc1|destination",
        };
        const data = [
            ["tag", null, "destination"],
            [null, null, null],
        ];
        const meta = metaStore([
            ["0,0", { className: BOLD_CLASS }],
            ["0,2", { className: HIGHLIGHT_CLASS, source: destinationSource }],
        ]);
        const { hot } = extensionHot(data, meta, {
            startRow: 0,
            endRow: 0,
            startCol: 0,
            endCol: 0,
        });
        hot.setDataAtCell.mockImplementationOnce(() => {
            throw new Error("write");
        });
        const onMutated = vi.fn();
        const beforeReplica = getReplica();
        setActiveHot(hot as never, onMutated, sheet.id, 0);

        executeCommand("cell.extend");

        expect(data).toEqual([
            ["tag", null, "destination"],
            [null, null, null],
        ]);
        expect(meta.at(0, 2).className).toBe(HIGHLIGHT_CLASS);
        expect(meta.at(0, 2).source).toEqual(destinationSource);
        expect(meta.at(1, 2).className).toBe("");
        expect(meta.at(1, 2).source).toBeUndefined();
        expect(hot.selectCells).not.toHaveBeenCalled();
        expect(onMutated).not.toHaveBeenCalled();
        expect(getReplica()).toBe(beforeReplica);
        expect(toast.error).toHaveBeenCalledWith("Could not extend this argument");
    });

    it("no-op gracefully without a live grid", () => {
        expect(() => {
            executeCommand("edit.undo");
            executeCommand("edit.redo");
            executeCommand("format.toggleBold");
            executeCommand("row.delete");
            executeCommand("cell.extend");
        }).not.toThrow();
    });

    it("toggleBold writes classNames over the selection and notifies", () => {
        const meta = metaStore();
        const onMutated = vi.fn();
        const hot = selectionHot(1, meta);
        setActiveHot(hot as never, onMutated, null, 0);

        executeCommand("format.toggleBold");
        expect(meta.at(0, 0).className).toBe(BOLD_CLASS);
        expect(meta.at(1, 0).className).toBe(BOLD_CLASS);
        expect(hot.render).toHaveBeenCalled();
        expect(onMutated).toHaveBeenCalled();

        executeCommand("format.toggleBold");
        expect(meta.at(0, 0).className).toBe("");
        expect(meta.at(1, 0).className).toBe("");
    });

    it("toggleGroup writes the group className over the selection", () => {
        const meta = metaStore();
        setActiveHot(selectionHot(2, meta) as never, vi.fn(), null, 0);

        executeCommand("format.toggleGroup");
        expect(meta.at(0, 0).className).toBe(GROUP_CLASS);
        expect(meta.at(1, 0).className).toBe(GROUP_CLASS);
        expect(meta.at(2, 0).className).toBe(GROUP_CLASS);
    });

    it("toggleKicked marks a run without disturbing a highlight it already wears", () => {
        const meta = metaStore([["1,0", { className: HIGHLIGHT_CLASS }]]);
        setActiveHot(selectionHot(1, meta) as never, vi.fn(), null, 0);

        executeCommand("format.toggleKicked");
        expect(meta.at(0, 0).className).toBe(KICKED_CLASS);
        // A cell the opponent conceded and this side kicked anyway keeps both.
        expect(meta.at(1, 0).className).toBe(`${HIGHLIGHT_CLASS} ${KICKED_CLASS}`);
    });

    it("cell.insert shifts the selected column down and blanks the target", () => {
        const data = [["a"], ["b"], ["c"]];
        const meta = metaStore([["0,0", { className: BOLD_CLASS }]]);
        const onMutated = vi.fn();
        const fakeHot = {
            getSelectedLast: () => [1, 0],
            countRows: () => data.length,
            countCols: () => 1,
            getDataAtCell: (r: number, c: number) => data[r][c],
            getCellMeta: meta.getCellMeta,
            setCellMeta: meta.setCellMeta,
            setDataAtCell: (changes: [number, number, string | null][]) => {
                for (const [r, c, v] of changes) data[r][c] = v as string;
            },
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, onMutated, null, 0);

        executeCommand("cell.insert");
        // Row 0 untouched, row 1 blanked, "b" pushed to row 2 ("c" falls off).
        expect(data.map((row) => row[0])).toEqual(["a", "", "b"]);
        expect(meta.at(1, 0).className).toBe("");
        // The opened cell inherits no provenance from the text it displaced.
        expect(meta.at(1, 0).source).toBeUndefined();
        expect(onMutated).toHaveBeenCalled();
    });

    it("cell.insertBelow blanks the row under the selection", () => {
        const data = [["a"], ["b"], ["c"], ["d"]];
        const meta = metaStore();
        const fakeHot = {
            getSelectedLast: () => [1, 0],
            countRows: () => data.length,
            countCols: () => 1,
            getDataAtCell: (r: number, c: number) => data[r][c],
            getCellMeta: meta.getCellMeta,
            setCellMeta: meta.setCellMeta,
            setDataAtCell: (changes: [number, number, string | null][]) => {
                for (const [r, c, v] of changes) data[r][c] = v as string;
            },
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, vi.fn(), null, 0);

        executeCommand("cell.insertBelow");
        // "b" stays put, row 2 blanked, "c" pushed down ("d" falls off).
        expect(data.map((row) => row[0])).toEqual(["a", "b", "", "c"]);
    });

    it("cell.insertBelow on the last row is a no-op", () => {
        const data = [["a"], ["b"]];
        const fakeHot = {
            getSelectedLast: () => [1, 0],
            countRows: () => data.length,
            countCols: () => 1,
            getDataAtCell: (r: number, c: number) => data[r][c],
            getCellMeta: () => ({}),
            setCellMeta: vi.fn(),
            setDataAtCell: vi.fn(),
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, vi.fn(), null, 0);

        executeCommand("cell.insertBelow");
        expect(fakeHot.setDataAtCell).not.toHaveBeenCalled();
    });

    it("cell.move opens a session over the selection", () => {
        const data = [["a"], ["b"], ["c"]];
        const fakeHot = {
            getSelectedRangeLast: () => ({
                getTopLeftCorner: () => ({ row: 1, col: 0 }),
                getBottomRightCorner: () => ({ row: 2, col: 0 }),
            }),
            countRows: () => data.length,
            countCols: () => 1,
            getDataAtCell: (r: number, c: number) => data[r][c],
            setDataAtCell: vi.fn(),
            getCellMeta: () => ({}),
            setCellMeta: vi.fn(),
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, vi.fn(), null, 0);

        executeCommand("cell.move");

        expect(isMovingIn(fakeHot as never)).toBe(true);
        expect(movingBlock()).toEqual({ cols: [0], blockStart: 1, height: 2 });
        revertMove();
    });

    it("cell.move without a selection is a no-op", () => {
        const fakeHot = {
            getSelectedRangeLast: () => undefined,
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, vi.fn(), null, 0);

        executeCommand("cell.move");

        expect(movingBlock()).toBeNull();
    });
});

/**
 * An aligned pane leads with one inert column per speech the sheet does not
 * show. A command reads its column off the grid and puts it on the wire, so it
 * converts against the count the pane published; without that, a decoration or
 * an opened cell lands on a partner's speech.
 */
describe("grid commands on a padded pane", () => {
    /** One spacer, so grid column 1 is the sheet's first cell. */
    const SPACERS = 1;

    function paddedRound(data: (string | null)[][] = []) {
        const round = makeFlowRound({});
        const sheet = round.sheets.find((s) => s.kind !== "cx")!;
        sheet.data = data;
        // One decoration under the cell the cursor names and one under the
        // grid slot it sits in, so which key a command read is visible.
        sheet.meta = { "0,0": { bold: true }, "0,1": { highlight: true } };
        useFlowStore.getState().loadRound(round);
        useFlowStore.setState({ activeSheetId: sheet.id });
        const stored = useFlowStore.getState().round!;
        // Seeded without that meta, so an op reporting a decoration shows up
        // in the projection instead of matching what was already there.
        seedReplica({ ...stored, sheets: stored.sheets.map((s) => ({ ...s, meta: {} })) });
        return { round: stored, sheetId: sheet.id };
    }

    const projected = (round: FlowRound, sheetId: string) =>
        projectDoc(getReplica()!, round).sheets.find((s) => s.id === sheetId)!;

    afterEach(() => clearReplica());

    it("cell.insert opens the cell the selected column stands for", () => {
        const { round, sheetId } = paddedRound([
            ["a", "x"],
            ["b", "y"],
            ["c", "z"],
        ]);
        const data = [
            ["pad", "a"],
            ["pad", "b"],
            ["pad", "c"],
        ];
        const fakeHot = {
            getSelectedLast: () => [1, 1],
            countRows: () => data.length,
            countCols: () => 2,
            getDataAtCell: (r: number, c: number) => data[r][c],
            getCellMeta: () => ({}),
            setCellMeta: vi.fn(),
            setDataAtCell: (changes: [number, number, string | null][]) => {
                for (const [r, c, v] of changes) data[r][c] = v as string;
            },
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, vi.fn(), sheetId, SPACERS);

        executeCommand("cell.insert");

        // The grid shifts the column the cursor is in ...
        expect(data.map((row) => row[1])).toEqual(["a", "", "b"]);
        // ... and the op opens the cell that column names, leaving the
        // speech beside it exactly where a partner still has it.
        const sheet = projected(round, sheetId);
        expect(sheet.data.map((row) => row[0])).toEqual(["a", null, "b", "c"]);
        expect(sheet.data.map((row) => row[1])).toEqual(["x", "y", "z", null]);
    });

    it("a decoration records the cell it marks, with that cell's own meta", () => {
        const { round, sheetId } = paddedRound([["a", "x"]]);
        const meta = metaStore();
        const hot = {
            getSelectedRange: () => [
                {
                    highlight: { row: 0, col: 1 },
                    getTopLeftCorner: () => ({ row: 0, col: 1 }),
                    getBottomRightCorner: () => ({ row: 0, col: 1 }),
                },
            ],
            getCellMeta: meta.getCellMeta,
            setCellMeta: meta.setCellMeta,
            render: vi.fn(),
        };
        setActiveHot(hot as never, vi.fn(), sheetId, SPACERS);

        executeCommand("format.toggleBold");

        // The class goes on the grid cell the cursor is in, and the op names
        // the cell that column stands for, carrying the meta stored under
        // that cell's own key rather than the grid slot's.
        expect(meta.at(0, 1).className).toBe(BOLD_CLASS);
        expect(projected(round, sheetId).meta).toEqual({ "0,0": { bold: true } });
    });
});

describe("collab commands", () => {
    const ALEX = { name: "Alex" } as const;

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
        useContactPicker.getState().cancel();
        useFlowStore.setState({ collabEnabled: false, contacts: {} });
    });

    it("invite asks which saved contact to dial, and dials nobody before the answer", async () => {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        loadRound();
        useFlowStore.setState({ collabEnabled: true, contacts: { alex: ALEX } });

        executeCommand("collab.invite");

        await vi.waitFor(() =>
            expect(useContactPicker.getState().contacts).toEqual({ alex: ALEX }),
        );
        expect(useContactPicker.getState().role).toBe("editor");
    });

    // Two entries, one picker: the grade is the difference between them, so
    // the picker has to open holding the one the debater clicked.
    it("opens the picker on the grade the entry named", async () => {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        loadRound();
        useFlowStore.setState({ collabEnabled: true, contacts: { alex: ALEX } });

        executeCommand("collab.inviteView");

        await vi.waitFor(() => expect(useContactPicker.getState().role).toBe("viewer"));
    });
});

describe("a viewer at the keyboard", () => {
    afterEach(() => {
        useCollabStore.getState().reset();
    });

    it("changes nothing about the round, and is told why", () => {
        loadRound();
        const before = useFlowStore.getState().round!.sheets.length;
        useCollabStore.setState({ selfRole: "viewer" });

        executeCommand("sheet.newAff");
        executeCommand("sheet.newNeg");

        expect(useFlowStore.getState().round!.sheets).toHaveLength(before);
        expect(toast).toHaveBeenCalledWith("You are viewing this round, not editing it");
    });

    it("still navigates, looks, and configures", () => {
        loadRound();
        // Two sheets to step between, made before the role lands: what is
        // refused is the edit, and this proves the refusal is not everything.
        executeCommand("sheet.newAff");
        const second = useFlowStore.getState().activeSheetId;
        useCollabStore.setState({ selfRole: "viewer" });

        executeCommand("sheet.prev");
        expect(useFlowStore.getState().activeSheetId).not.toBe(second);
        executeCommand("settings.open");
        expect(useFlowStore.getState().settingsOpen).toBe(true);
        executeCommand("sidebar.toggle");
        expect(useFlowStore.getState().sidebarCollapsed).toBe(true);
    });

    it("paints a range but cannot reorder the host's sheets", () => {
        loadRound();
        const first = useFlowStore.getState().activeSheetId!;
        const second = useFlowStore.getState().addSheet({ title: "B", group: "aff" });
        useFlowStore.getState().setActiveSheet(first);
        useCollabStore.setState({ selfRole: "viewer" });

        // Extending is one sidebar's own business and edits nothing.
        executeCommand("sheet.extendDown");
        expect(useFlowStore.getState().sheetRange).toEqual({ anchor: first, head: second });

        executeCommand("sheet.moveDown");
        const flows = sortedSheets(useFlowStore.getState().round!).filter((s) => s.kind !== "cx");
        expect(flows.map((s) => s.id)).toEqual([first, second]);
    });

    it("lets an editor do all of it, which is what makes the refusal the role", () => {
        loadRound();
        const before = useFlowStore.getState().round!.sheets.length;

        executeCommand("sheet.newAff");

        expect(useFlowStore.getState().round!.sheets).toHaveLength(before + 1);
    });

    it("grades every command, so a new one cannot slip through ungraded", () => {
        for (const id of Object.keys(COMMANDS) as CommandId[]) {
            expect(EDITS_ROUND[id], id).toBeTypeOf("boolean");
        }
        expect(Object.keys(EDITS_ROUND).sort()).toEqual(Object.keys(COMMANDS).sort());
    });
});
