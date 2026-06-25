import { describe, it, expect, beforeEach } from "vitest";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";

const BLANK_STATE = {
    round: null,
    activeSheetId: null,
    selection: null,
};

function resetStore() {
    useRoundStore.setState(BLANK_STATE);
}

function setupRound() {
    const fmt = makeFormatByKey("policy");
    useRoundStore.getState().createRound({ role: "aff", format: fmt });
    const sheetId = useRoundStore
        .getState()
        .addSheet({ title: "DA", group: "neg" });
    const sp = fmt.speeches[1].id; // 1NC
    const a = useRoundStore
        .getState()
        .addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore
        .getState()
        .addNode({ sheetId, speechId: sp, parentId: null });
    return { sheetId, sp, a, b };
}

describe("display settings", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("setAutoNumber persists", () => {
        useRoundStore.getState().setAutoNumber(true);
        const raw = window.localStorage.getItem("df-display-settings");
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed.autoNumber).toBe(true);
    });
});

describe("Group Actions (Task 2)", () => {
    beforeEach(resetStore);

    it("groupNodes bundles two nodes and is undoable", () => {
        const { sheetId, a, b } = setupRound();

        useRoundStore.getState().groupNodes(sheetId, [a, b], "DAs");
        const groups = useRoundStore.getState().round!.groups;
        expect(groups).toHaveLength(1);
        expect(groups[0].memberIds).toEqual([a, b]);

        useRoundStore.getState().undo();
        expect(useRoundStore.getState().round!.groups).toHaveLength(0);
    });

    it("ungroupNode removes a node from its group", () => {
        const { sheetId, a, b } = setupRound();

        useRoundStore.getState().groupNodes(sheetId, [a, b], "");
        useRoundStore.getState().ungroupNode(a);
        const groups = useRoundStore.getState().round!.groups;
        expect(groups).toHaveLength(0); // Dissolved because <2 remain.
    });
});

// ─── Coordinate-based store actions (Task 6) ─────────────────────────────

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";

function freshRound() {
    useRoundStore
        .getState()
        .createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    const id = useRoundStore
        .getState()
        .addSheet({ title: "1AC", group: "aff" });
    useRoundStore.getState().setActiveSheet(id);
    return id;
}

describe("coordinate store actions", () => {
    beforeEach(resetStore);

    it("placeBareNode creates a null-parent node at the exact cell", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        const id = s.placeBareNode({ sheetId, speechId, row: 4 });
        const node = useRoundStore
            .getState()
            .round!.nodes.find((n) => n.id === id)!;
        expect(node.row).toBe(4);
        expect(node.parentId).toBeNull();
    });

    it("spawnSibling places below with inherited parentId", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        const a = s.placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId, row: 0 });
        const b = useRoundStore.getState().spawnSibling()!;
        const nb = useRoundStore
            .getState()
            .round!.nodes.find((n) => n.id === b)!;
        expect(nb.row).toBe(1);
        expect(nb.speechId).toBe(speechId);
        expect(nb.parentId).toBeNull(); // inherited from root a
    });

    it("spawnResponse places same-row next column, parent = current", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        const a = s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        const r = useRoundStore.getState().spawnResponse()!;
        const nr = useRoundStore
            .getState()
            .round!.nodes.find((n) => n.id === r)!;
        expect(nr.speechId).toBe(sp[1].id);
        expect(nr.row).toBe(0);
        expect(nr.parentId).toBe(a);
    });

    it("clearCell orphans children in place", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        const a = s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        const child = useRoundStore.getState().spawnResponse()!;
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().clearCell();
        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === a)).toBeUndefined();
        expect(nodes.find((n) => n.id === child)!.parentId).toBeNull();
    });

    it("deleteRow removes the row's nodes and ripples up", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        s.placeBareNode({ sheetId, speechId: sp[0].id, row: 1 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().deleteRow();
        const col = useRoundStore
            .getState()
            .round!.nodes.filter((n) => n.speechId === sp[0].id);
        expect(col.map((n) => n.row)).toEqual([0]); // old row-1 node shifted up
    });

    it("insertRowAbove ripples nodes down", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        s.placeBareNode({ sheetId, speechId: sp[0].id, row: 1 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().insertRowAbove();
        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.row === 0 && n.speechId === sp[0].id)).toBeUndefined(); // row 0 is now empty
        expect(nodes.find((n) => n.row === 1 && n.speechId === sp[0].id)).toBeDefined(); // old row 0 shifted to row 1
    });

    it("deleteSubtreeAt removes the node and all descendants", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        const root = s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().spawnResponse(); // child at sp[1]:0
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().deleteSubtreeAt();
        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === root)).toBeUndefined();
        // response child should also be gone
        expect(nodes.some((n) => n.parentId === root)).toBe(false);
    });
});
