import { beforeEach, describe, expect, it, vi } from "vitest";

import { BOLD_CLASS, GROUP_CLASS } from "@/lib/grid/codec";
import { setActiveHot } from "@/lib/grid/hotInstance";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { executeCommand } from "./commands";

function loadRound() {
    const round = makeFlowRound("aff");
    useFlowStore.getState().loadRound(round);
    return round;
}

beforeEach(() => {
    setActiveHot(null, null);
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
    });
});

describe("sheet commands", () => {
    it("newAff/newNeg add and activate an Untitled sheet", () => {
        loadRound();
        executeCommand("sheet.newNeg");
        const state = useFlowStore.getState();
        const active = state.round!.sheets.find((s) => s.id === state.activeSheetId)!;
        expect(active.title).toBe("Untitled");
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
        useFlowStore.getState().loadRound(makeFlowRound("aff"));
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
    const round = makeFlowRound("aff");
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
    it("no-op gracefully without a live grid", () => {
        expect(() => {
            executeCommand("edit.undo");
            executeCommand("edit.redo");
            executeCommand("format.toggleBold");
            executeCommand("row.delete");
        }).not.toThrow();
    });

    it("toggleBold writes classNames over the selection and notifies", () => {
        const meta = new Map<string, { className?: string }>();
        const at = (r: number, c: number) => {
            const key = `${r},${c}`;
            if (!meta.has(key)) meta.set(key, {});
            return meta.get(key)!;
        };
        const onMutated = vi.fn();
        const render = vi.fn();
        const fakeHot = {
            getSelectedRange: () => [
                {
                    highlight: { row: 0, col: 0 },
                    getTopLeftCorner: () => ({ row: 0, col: 0 }),
                    getBottomRightCorner: () => ({ row: 1, col: 0 }),
                },
            ],
            getCellMeta: (r: number, c: number) => at(r, c),
            setCellMeta: (r: number, c: number, _k: string, v: string) => {
                at(r, c).className = v;
            },
            render,
        };
        // The fake covers exactly the surface toggleDecoration touches.
        setActiveHot(fakeHot as never, onMutated);

        executeCommand("format.toggleBold");
        expect(at(0, 0).className).toBe(BOLD_CLASS);
        expect(at(1, 0).className).toBe(BOLD_CLASS);
        expect(render).toHaveBeenCalled();
        expect(onMutated).toHaveBeenCalled();

        executeCommand("format.toggleBold");
        expect(at(0, 0).className).toBe("");
        expect(at(1, 0).className).toBe("");
    });

    it("toggleGroup writes the group className over the selection", () => {
        const meta = new Map<string, { className?: string }>();
        const at = (r: number, c: number) => {
            const key = `${r},${c}`;
            if (!meta.has(key)) meta.set(key, {});
            return meta.get(key)!;
        };
        const fakeHot = {
            getSelectedRange: () => [
                {
                    highlight: { row: 0, col: 0 },
                    getTopLeftCorner: () => ({ row: 0, col: 0 }),
                    getBottomRightCorner: () => ({ row: 2, col: 0 }),
                },
            ],
            getCellMeta: (r: number, c: number) => at(r, c),
            setCellMeta: (r: number, c: number, _k: string, v: string) => {
                at(r, c).className = v;
            },
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, vi.fn());

        executeCommand("format.toggleGroup");
        expect(at(0, 0).className).toBe(GROUP_CLASS);
        expect(at(1, 0).className).toBe(GROUP_CLASS);
        expect(at(2, 0).className).toBe(GROUP_CLASS);
    });

    it("cell.insert shifts the selected column down and blanks the target", () => {
        const data = [["a"], ["b"], ["c"]];
        const meta = new Map<string, { className?: string }>([["0,0", { className: BOLD_CLASS }]]);
        const at = (r: number, c: number) => {
            const key = `${r},${c}`;
            if (!meta.has(key)) meta.set(key, {});
            return meta.get(key)!;
        };
        const onMutated = vi.fn();
        const fakeHot = {
            getSelectedLast: () => [1, 0],
            countRows: () => data.length,
            getDataAtCell: (r: number, c: number) => data[r][c],
            getCellMeta: (r: number, c: number) => at(r, c),
            setCellMeta: (r: number, c: number, _k: string, v: string) => {
                at(r, c).className = v;
            },
            setDataAtCell: (changes: [number, number, string | null][]) => {
                for (const [r, c, v] of changes) data[r][c] = v as string;
            },
            render: vi.fn(),
        };
        setActiveHot(fakeHot as never, onMutated);

        executeCommand("cell.insert");
        // Row 0 untouched, row 1 blanked, "b" pushed to row 2 ("c" falls off).
        expect(data.map((row) => row[0])).toEqual(["a", "", "b"]);
        expect(at(1, 0).className).toBe("");
        expect(onMutated).toHaveBeenCalled();
    });
});
