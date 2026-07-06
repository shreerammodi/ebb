import { beforeEach, describe, expect, it } from "vitest";

import { makeFlowRound, makeFlowSheet } from "@/lib/model/flow";

import { useFlowStore } from "./useFlowStore";

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
