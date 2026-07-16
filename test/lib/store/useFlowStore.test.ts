import { beforeEach, describe, expect, it } from "vitest";

import { makeFlowRound, makeFlowSheet } from "@/lib/model/flow";
import { focusedSheetId, useFlowStore } from "@/lib/store/useFlowStore";

function loadFresh(role: "aff" | "neg" = "aff") {
    const round = makeFlowRound(role);
    useFlowStore.getState().loadRound(round);
    return round;
}

beforeEach(() => {
    useFlowStore.setState({ round: null, activeSheetId: null, speechTarget: null });
});

describe("setSideColor", () => {
    it("sets a side's ink and persists it, and null resets it", () => {
        useFlowStore.getState().setSideColor("aff", "#123456");
        expect(useFlowStore.getState().affColor).toBe("#123456");
        expect(window.localStorage.getItem("ebb-display-settings")).toContain("#123456");

        useFlowStore.getState().setSideColor("aff", null);
        expect(useFlowStore.getState().affColor).toBeNull();
    });
});

describe("loadRound", () => {
    it("defaults the active sheet to the first flow sheet", () => {
        const round = loadFresh();
        const flow = round.sheets.find((s) => s.kind !== "cx")!;
        expect(useFlowStore.getState().activeSheetId).toBe(flow.id);
    });

    it("honors an explicit activeSheetId option", () => {
        const round = makeFlowRound("aff");
        const cx = round.sheets.find((s) => s.kind === "cx")!;
        useFlowStore.getState().loadRound(round, { activeSheetId: cx.id });
        expect(useFlowStore.getState().activeSheetId).toBe(cx.id);
    });

    it("forces the RFD drawer closed for a new flow but restores the preference otherwise", () => {
        useFlowStore.getState().setRfdOpen(true);

        useFlowStore.getState().loadRound(makeFlowRound("aff"), { newFlow: true });
        expect(useFlowStore.getState().rfdOpen).toBe(false);
        // Forcing it closed stays transient: the persisted preference is intact.
        expect(window.localStorage.getItem("ebb-display-settings")).toContain('"rfdOpen":true');

        useFlowStore.getState().loadRound(makeFlowRound("aff"));
        expect(useFlowStore.getState().rfdOpen).toBe(true);
    });

    it("persists rfdVim through setRfdVim", () => {
        useFlowStore.getState().setRfdVim(true);
        expect(useFlowStore.getState().rfdVim).toBe(true);
        expect(window.localStorage.getItem("ebb-display-settings")).toContain('"rfdVim":true');
    });

    it("persists insertPaste through setInsertPaste", () => {
        expect(useFlowStore.getState().insertPaste).toBe(false);
        useFlowStore.getState().setInsertPaste(true);
        expect(useFlowStore.getState().insertPaste).toBe(true);
        expect(window.localStorage.getItem("ebb-display-settings")).toContain('"insertPaste":true');
    });
});

describe("switchSpeech", () => {
    it("focuses the topmost flow sheet and records the speech target", () => {
        const round = loadFresh();
        const top = round.sheets.find((s) => s.kind !== "cx")!;
        // Move focus off the topmost sheet so the switch has to bring it back.
        const other = useFlowStore.getState().addSheet({ title: "DA", group: "neg" });
        expect(useFlowStore.getState().activeSheetId).toBe(other);

        useFlowStore.getState().switchSpeech("2ac");
        expect(useFlowStore.getState().activeSheetId).toBe(top.id);
        expect(useFlowStore.getState().speechTarget).toEqual({ speechId: "2ac" });
    });

    it("is a no-op without a round", () => {
        useFlowStore.getState().switchSpeech("2ac");
        expect(useFlowStore.getState().speechTarget).toBeNull();
    });
});

describe("sheet operations", () => {
    it("addSheet appends with the next order, activates, and bumps updatedAt", () => {
        const round = loadFresh();
        const before = useFlowStore.getState().round!.updatedAt;
        const id = useFlowStore.getState().addSheet({ title: "DA", group: "neg" });
        const state = useFlowStore.getState();
        const sheet = state.round!.sheets.find((s) => s.id === id)!;
        expect(sheet.order).toBe(1);
        expect(sheet.startSpeechId).toBe("1nc");
        expect(state.activeSheetId).toBe(id);
        expect(state.round!.updatedAt).toBeGreaterThanOrEqual(before);
        expect(state.round!.id).toBe(round.id);
    });

    it("addSheets appends all in one update, numbering per side and activating the first", () => {
        loadFresh("aff"); // starts with CX + one aff flow sheet
        const state = () => useFlowStore.getState();
        const before = state().round!.updatedAt;
        const beforeCount = state().round!.sheets.length;

        const ids = state().addSheets([{ group: "aff" }, { group: "aff" }, { group: "neg" }]);

        const sheets = state().round!.sheets;
        expect(ids).toHaveLength(3);
        expect(sheets).toHaveLength(beforeCount + 3);
        const created = ids.map((id) => sheets.find((s) => s.id === id)!);
        // Existing aff sheet is "1.", so the batch continues per side.
        expect(created.map((s) => s.title)).toEqual(["2.", "3.", "1."]);
        expect(created.map((s) => s.group)).toEqual(["aff", "aff", "neg"]);
        // Appended contiguously after existing sheets, first batch sheet active.
        expect(created.map((s) => s.order)).toEqual([1, 2, 3]);
        expect(state().activeSheetId).toBe(ids[0]);
        expect(state().round!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it("addSheets is a no-op on empty input", () => {
        loadFresh();
        const state = () => useFlowStore.getState();
        const before = state().round;
        expect(state().addSheets([])).toEqual([]);
        expect(state().round).toBe(before);
    });

    it("renameSheet renames; removeSheet refuses CX and restores cleanly", () => {
        loadFresh();
        const state = () => useFlowStore.getState();
        const cx = state().round!.sheets.find((s) => s.kind === "cx")!;
        expect(state().removeSheet(cx.id)).toBeNull();

        const id = state().addSheet({ title: "K", group: "neg" });
        state().renameSheet(id, "Kritik");
        expect(state().round!.sheets.find((s) => s.id === id)!.title).toBe("Kritik");

        const removed = state().removeSheet(id)!;
        expect(removed.sheet.title).toBe("Kritik");
        expect(removed.wasActive).toBe(true);
        expect(state().round!.sheets.some((s) => s.id === id)).toBe(false);
        expect(state().activeSheetId).not.toBe(id);

        state().restoreSheet(removed);
        expect(state().round!.sheets.some((s) => s.id === id)).toBe(true);
        expect(state().activeSheetId).toBe(id);
    });

    it("reorderSheets renumbers only the listed flow sheets", () => {
        loadFresh();
        const state = () => useFlowStore.getState();
        const a = state().round!.sheets.find((s) => s.kind !== "cx")!.id;
        const b = state().addSheet({ title: "B", group: "aff" });
        state().reorderSheets([b, a]);
        const sheets = state().round!.sheets;
        expect(sheets.find((s) => s.id === b)!.order).toBe(0);
        expect(sheets.find((s) => s.id === a)!.order).toBe(1);
        expect(sheets.find((s) => s.kind === "cx")!.order).toBe(-1);
    });
});

describe("updateSheetData", () => {
    it("replaces data/meta and bumps updatedAt; identical payload does not bump", () => {
        loadFresh();
        const state = () => useFlowStore.getState();
        const sheetId = state().activeSheetId!;
        state().updateSheetData(sheetId, [["a"]], { "0,0": { bold: true } });
        const afterFirst = state().round!.updatedAt;
        const sheet = state().round!.sheets.find((s) => s.id === sheetId)!;
        expect(sheet.data).toEqual([["a"]]);
        expect(sheet.meta).toEqual({ "0,0": { bold: true } });

        state().updateSheetData(sheetId, [["a"]], { "0,0": { bold: true } });
        expect(state().round!.updatedAt).toBe(afterFirst);
    });
});

describe("setRfdOpen", () => {
    it("toggles the RFD drawer and persists the open state", () => {
        useFlowStore.getState().setRfdOpen(true);
        expect(useFlowStore.getState().rfdOpen).toBe(true);

        const raw = window.localStorage.getItem("ebb-display-settings");
        expect(JSON.parse(raw!).rfdOpen).toBe(true);

        useFlowStore.getState().setRfdOpen(false);
        expect(useFlowStore.getState().rfdOpen).toBe(false);
    });
});

describe("setScouting", () => {
    it("merges partial patches and bumps updatedAt", () => {
        loadFresh();
        useFlowStore.getState().setScouting({ tournament: "TOC" });
        useFlowStore.getState().setScouting({ judge: "Lee" });
        const sc = useFlowStore.getState().round!.scouting;
        expect(sc.tournament).toBe("TOC");
        expect(sc.judge).toBe("Lee");
    });
});

function threeFlowSheets() {
    // Fresh aff round has CX + one flow sheet ("1.", order 0). Add two more.
    const round = makeFlowRound("aff");
    useFlowStore.getState().loadRound(round);
    const a = round.sheets.find((s) => s.kind !== "cx")!.id;
    const b = useFlowStore.getState().addSheet({ title: "DA", group: "neg" });
    const c = useFlowStore.getState().addSheet({ title: "CP", group: "neg" });
    // addSheet makes the new sheet active; reset to the first flow sheet.
    useFlowStore.getState().setActiveSheet(a);
    return { a, b, c };
}

describe("split view", () => {
    beforeEach(() => {
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
            splitSheetId: null,
            focusedPane: 1,
            revealTarget: null,
            speechTarget: null,
        });
    });

    it("toggleSplit opens with the next sheet in the second pane", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit();
        expect(useFlowStore.getState().activeSheetId).toBe(a);
        expect(useFlowStore.getState().splitSheetId).toBe(b);
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });

    it("toggleSplit collapses back to the focused pane's sheet", () => {
        const { b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit();
        useFlowStore.getState().focusPane(2);
        useFlowStore.getState().toggleSplit();
        expect(useFlowStore.getState().splitSheetId).toBeNull();
        expect(useFlowStore.getState().activeSheetId).toBe(b);
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });

    it("setActiveSheet retargets the focused pane", () => {
        const { a, b, c } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // panes a | b, focus 1
        useFlowStore.getState().focusPane(2);
        useFlowStore.getState().setActiveSheet(c);
        expect(useFlowStore.getState().activeSheetId).toBe(a); // pane 1 unchanged
        expect(useFlowStore.getState().splitSheetId).toBe(c); // pane 2 retargeted
    });

    it("picking the other pane's sheet swaps the panes (no duplicates)", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // a | b, focus 1
        useFlowStore.getState().setActiveSheet(b); // b already in pane 2
        expect(useFlowStore.getState().activeSheetId).toBe(b);
        expect(useFlowStore.getState().splitSheetId).toBe(a);
    });

    it("picking the other pane's sheet swaps the panes, focused on pane 2", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // a | b, focus 1
        useFlowStore.getState().focusPane(2);
        useFlowStore.getState().setActiveSheet(a); // a already in pane 1
        expect(useFlowStore.getState().activeSheetId).toBe(b);
        expect(useFlowStore.getState().splitSheetId).toBe(a);
    });

    it("focusPane is a no-op outside split", () => {
        threeFlowSheets();
        useFlowStore.getState().focusPane(2);
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });

    it("focusedSheetId reads the focused pane", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit();
        expect(focusedSheetId(useFlowStore.getState())).toBe(a);
        useFlowStore.getState().focusPane(2);
        expect(focusedSheetId(useFlowStore.getState())).toBe(b);
    });

    it("revealCell carries the sheet id and retargets the focused pane", () => {
        const { a, b, c } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // a | b, focus 1
        useFlowStore.getState().revealCell(c, 2, 3);
        expect(useFlowStore.getState().activeSheetId).toBe(c); // pane 1 retargeted
        expect(useFlowStore.getState().revealTarget).toEqual({ sheetId: c, row: 2, col: 3 });
    });

    it("switchSpeech in split records the target without moving sheets", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit();
        useFlowStore.getState().switchSpeech("2ac");
        expect(useFlowStore.getState().activeSheetId).toBe(a);
        expect(useFlowStore.getState().splitSheetId).toBe(b);
        expect(useFlowStore.getState().speechTarget).toEqual({ speechId: "2ac" });
    });

    it("removeSheet on pane 2's sheet collapses the split, leaving pane 1 untouched", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // a | b, focus 1
        const removed = useFlowStore.getState().removeSheet(b)!;
        expect(removed.wasActive).toBe(false);
        expect(useFlowStore.getState().splitSheetId).toBeNull();
        expect(useFlowStore.getState().activeSheetId).toBe(a);
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });

    it("removeSheet on pane 1's sheet promotes pane 2's sheet and collapses the split", () => {
        const { a, b } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // a | b, focus 1
        const removed = useFlowStore.getState().removeSheet(a)!;
        expect(removed.wasActive).toBe(true);
        expect(useFlowStore.getState().activeSheetId).toBe(b);
        expect(useFlowStore.getState().splitSheetId).toBeNull();
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });

    it("removeSheet on a sheet shown in neither pane leaves the split untouched", () => {
        const { a, b, c } = threeFlowSheets();
        useFlowStore.getState().toggleSplit(); // a | b, focus 1
        const removed = useFlowStore.getState().removeSheet(c)!;
        expect(removed.wasActive).toBe(false);
        expect(useFlowStore.getState().activeSheetId).toBe(a);
        expect(useFlowStore.getState().splitSheetId).toBe(b);
        expect(useFlowStore.getState().focusedPane).toBe(1);
    });
});

describe("grid zoom", () => {
    beforeEach(() => {
        useFlowStore.setState({ gridZoom: 1, defaultGridZoom: 1 });
    });

    it("steps and clamps the live zoom without touching the default", () => {
        useFlowStore.getState().zoomGrid(0.1);
        expect(useFlowStore.getState().gridZoom).toBe(1.1);

        // Clamps to the bounds (0.5 - 3) and never mutates defaultGridZoom.
        useFlowStore.getState().setGridZoom(9);
        expect(useFlowStore.getState().gridZoom).toBe(3);
        useFlowStore.getState().setGridZoom(0.1);
        expect(useFlowStore.getState().gridZoom).toBe(0.5);
        expect(useFlowStore.getState().defaultGridZoom).toBe(1);
    });

    it("snaps steps to whole percents so they never drift", () => {
        useFlowStore.getState().setGridZoom(0.5);
        for (let i = 0; i < 3; i++) useFlowStore.getState().zoomGrid(0.1);
        expect(useFlowStore.getState().gridZoom).toBe(0.8);
    });

    it("persists the default zoom and applies it to the live zoom", () => {
        useFlowStore.getState().setDefaultGridZoom(1.25);
        expect(useFlowStore.getState().defaultGridZoom).toBe(1.25);
        expect(useFlowStore.getState().gridZoom).toBe(1.25);
        // Persisted into the synced display-settings bucket, not a bucket of its own.
        expect(window.localStorage.getItem("ebb-display-settings")).toContain(
            '"defaultGridZoom":1.25',
        );
    });
});
