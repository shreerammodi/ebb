import { describe, it, expect, beforeEach } from "vitest";

import { DEFAULT_FONT_ID } from "@/lib/fonts/registry";
import { makeFormatByKey } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

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
    const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
    const sp = fmt.speeches[1].id; // 1NC
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
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

describe("Group Actions", () => {
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

// ─── Coordinate-based store actions ──────────────────────────────────────

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";

function freshRound() {
    useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    const id = useRoundStore.getState().addSheet({ title: "1AC", group: "aff" });
    useRoundStore.getState().setActiveSheet(id);
    return id;
}

/**
 * Spawn actions only arm `pendingSpawn`; they do not create a node. These
 * helpers mimic "press Enter (or Shift+Enter) and type", returning the new
 * node's id, for tests that just need a populated fixture.
 */
function spawnSiblingAndType(text = "x"): string {
    useRoundStore.getState().spawnSibling();
    return useRoundStore.getState().commitPendingSpawn(text)!;
}
function spawnResponseAndType(text = "x"): string {
    useRoundStore.getState().spawnResponse();
    return useRoundStore.getState().commitPendingSpawn(text)!;
}

describe("coordinate store actions", () => {
    beforeEach(resetStore);

    it("placeBareNode creates a null-parent node at the exact cell", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        const id = s.placeBareNode({ sheetId, speechId, row: 4 });
        const node = useRoundStore.getState().round!.nodes.find((n) => n.id === id)!;
        expect(node.row).toBe(4);
        expect(node.parentId).toBeNull();
    });

    it("spawnSibling arms a deferred sibling below with inherited parentId", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        s.placeBareNode({ sheetId, speechId, row: 0 });
        const before = useRoundStore.getState().round!.nodes.length;

        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling();

        // No node yet — only an armed intent and a moved cursor.
        const armed = useRoundStore.getState();
        expect(armed.round!.nodes.length).toBe(before);
        expect(armed.pendingSpawn).toMatchObject({
            sheetId,
            speechId,
            row: 1,
            parentId: null,
            kind: "sibling",
        });
        expect(armed.selection).toEqual({ sheetId, speechId, row: 1 });

        // The first keystroke creates the node with the inherited parent.
        const b = useRoundStore.getState().commitPendingSpawn("resp")!;
        const nb = useRoundStore.getState().round!.nodes.find((n) => n.id === b)!;
        expect(nb.row).toBe(1);
        expect(nb.speechId).toBe(speechId);
        expect(nb.parentId).toBeNull(); // inherited from root a
        expect(nb.text).toBe("resp");
        expect(useRoundStore.getState().pendingSpawn).toBeNull();
    });

    it("spawnResponse arms a deferred response in the next column, parent = current", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        const a = s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().spawnResponse();
        expect(useRoundStore.getState().pendingSpawn).toMatchObject({
            speechId: sp[1].id,
            row: 0,
            parentId: a,
            kind: "response",
        });
        const r = useRoundStore.getState().commitPendingSpawn("x")!;
        const nr = useRoundStore.getState().round!.nodes.find((n) => n.id === r)!;
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
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        const child = spawnResponseAndType();
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
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
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().deleteRow();
        const col = useRoundStore.getState().round!.nodes.filter((n) => n.speechId === sp[0].id);
        expect(col.map((n) => n.row)).toEqual([0]); // old row-1 node shifted up
    });

    it("insertRowAbove ripples nodes down", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const sp = s.round!.format.speeches;
        s.placeBareNode({ sheetId, speechId: sp[0].id, row: 0 });
        s.placeBareNode({ sheetId, speechId: sp[0].id, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
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
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        spawnResponseAndType(); // child at sp[1]:0
        useRoundStore.getState().setSelection({ sheetId, speechId: sp[0].id, row: 0 });
        useRoundStore.getState().deleteSubtreeAt();
        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === root)).toBeUndefined();
        // response child should also be gone
        expect(nodes.some((n) => n.parentId === root)).toBe(false);
    });
});

describe("REGRESSION: sibling does not split a response band", () => {
    beforeEach(resetStore);

    it("Enter on an argument with six responses lands the sibling below the band", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speeches = s.round!.format.speeches;
        const c0 = speeches[0].id; // 1AC
        const c1 = speeches[1].id; // 1NC

        // arg1 in 1AC, then six responses stacked in 1NC (Enter on the first).
        const arg1 = s.placeBareNode({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: c0, row: 0 });
        spawnResponseAndType(); // response1 at (1NC, 0)
        for (let i = 0; i < 5; i++) {
            // Enter on the last response stacks the next one below it.
            spawnSiblingAndType();
        }
        // Sanity: six contiguous responses in 1NC at rows 0..5, all children of arg1.
        let nodes = useRoundStore.getState().round!.nodes;
        const responses = nodes.filter((n) => n.speechId === c1).sort((a, b) => a.row - b.row);
        expect(responses.map((n) => n.row)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(responses.every((n) => n.parentId === arg1)).toBe(true);

        // Now add a sibling of arg1 (select arg1, Enter).
        useRoundStore.getState().setSelection({ sheetId, speechId: c0, row: 0 });
        const arg2 = spawnSiblingAndType();

        nodes = useRoundStore.getState().round!.nodes;
        const a2 = nodes.find((n) => n.id === arg2)!;
        // arg2 lands BELOW the whole band (row 6), not interleaved.
        expect({ speechId: a2.speechId, row: a2.row }).toEqual({
            speechId: c0,
            row: 6,
        });
        // The response band is untouched — still contiguous at 0..5.
        expect(
            nodes
                .filter((n) => n.speechId === c1)
                .sort((a, b) => a.row - b.row)
                .map((n) => n.row),
        ).toEqual([0, 1, 2, 3, 4, 5]);
    });
});

// ─── Deferred spawn (pendingSpawn) ────────────────────────────────────────

describe("deferred spawn", () => {
    beforeEach(resetStore);

    it("does not spawn a node and arms nothing on an empty cell", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 3 });
        const r = useRoundStore.getState().spawnSibling();
        expect(r).toBeNull();
        expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
        expect(useRoundStore.getState().pendingSpawn).toBeNull();
    });

    it("only allows one pending spawn at a time", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        s.placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling();
        const armed = useRoundStore.getState().pendingSpawn;
        expect(armed?.kind).toBe("sibling");
        // A second spawn while one is pending no-ops and leaves the first intact.
        const r = useRoundStore.getState().spawnResponse();
        expect(r).toBeNull();
        expect(useRoundStore.getState().pendingSpawn).toEqual(armed);
    });

    it("shifts an occupied target down transiently — no autosave, no history", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        const arg1 = s.placeBareNode({ sheetId, speechId, row: 0 });
        const arg2 = s.placeBareNode({ sheetId, speechId, row: 1 });

        const updatedAtBefore = useRoundStore.getState().round!.updatedAt;
        const historyBefore = useRoundStore.getState().history!.currentId;

        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling(); // target row 1 is occupied → shift

        const after = useRoundStore.getState();
        // arg2 was pushed down to make room; arg1 stayed.
        expect(after.round!.nodes.find((n) => n.id === arg2)!.row).toBe(2);
        expect(after.round!.nodes.find((n) => n.id === arg1)!.row).toBe(0);
        expect(after.pendingSpawn).toMatchObject({ row: 1, preSpawnNodes: expect.any(Array) });
        // The shift is transient: it neither bumps updatedAt (no autosave) nor
        // grows the undo stack.
        expect(after.round!.updatedAt).toBe(updatedAtBefore);
        expect(after.history!.currentId).toBe(historyBefore);
    });

    it("commits the node and a single undo restores the pre-spawn flow", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        const arg1 = s.placeBareNode({ sheetId, speechId, row: 0 });
        const arg2 = s.placeBareNode({ sheetId, speechId, row: 1 });

        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling();
        const newId = useRoundStore.getState().commitPendingSpawn("between")!;

        let nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === newId)!.row).toBe(1);
        expect(nodes.find((n) => n.id === arg2)!.row).toBe(2);

        // One undo erases both the new node and the shift.
        useRoundStore.getState().undo();
        nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === newId)).toBeUndefined();
        expect(nodes.find((n) => n.id === arg1)!.row).toBe(0);
        expect(nodes.find((n) => n.id === arg2)!.row).toBe(1);
    });

    it("abandons a pending spawn, reversing its shift without touching history", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        s.placeBareNode({ sheetId, speechId, row: 0 });
        const arg2 = s.placeBareNode({ sheetId, speechId, row: 1 });

        const historyBefore = useRoundStore.getState().history!.currentId;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling();
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === arg2)!.row).toBe(2);

        useRoundStore.getState().abandonPendingSpawn();
        const after = useRoundStore.getState();
        expect(after.pendingSpawn).toBeNull();
        expect(after.round!.nodes.find((n) => n.id === arg2)!.row).toBe(1); // shift reversed
        expect(after.history!.currentId).toBe(historyBefore);
    });

    it("moving the cursor away abandons a pending spawn and reverses the shift", () => {
        freshRound();
        const s = useRoundStore.getState();
        const sheetId = s.activeSheetId!;
        const speechId = s.round!.format.speeches[0].id;
        s.placeBareNode({ sheetId, speechId, row: 0 });
        const arg2 = s.placeBareNode({ sheetId, speechId, row: 1 });

        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.getState().spawnSibling();
        // Navigate elsewhere (e.g. arrow key) → abandon.
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 5 });

        const after = useRoundStore.getState();
        expect(after.pendingSpawn).toBeNull();
        expect(after.round!.nodes.find((n) => n.id === arg2)!.row).toBe(1);
    });
});

// ─── removeSheet / restoreSheet (hardening: discoverable Undo) ────────────

describe("removeSheet + restoreSheet", () => {
    beforeEach(resetStore);

    it("removeSheet returns the removed sheet, its nodes, and groups", () => {
        const { sheetId, a, b } = setupRound();
        useRoundStore.getState().groupNodes(sheetId, [a, b], "DAs");
        useRoundStore.getState().setActiveSheet(sheetId);

        const removed = useRoundStore.getState().removeSheet(sheetId);

        expect(removed).not.toBeNull();
        expect(removed!.sheet.id).toBe(sheetId);
        expect(removed!.nodes.map((n) => n.id).sort()).toEqual([a, b].sort());
        expect(removed!.groups).toHaveLength(1);
        expect(removed!.wasActive).toBe(true);
        // The round no longer has the sheet or its nodes/groups.
        const round = useRoundStore.getState().round!;
        expect(round.sheets.some((s) => s.id === sheetId)).toBe(false);
        expect(round.nodes.some((n) => n.sheetId === sheetId)).toBe(false);
        expect(round.groups.some((g) => g.sheetId === sheetId)).toBe(false);
    });

    it("removeSheet returns null for an unknown sheet id", () => {
        setupRound();
        expect(useRoundStore.getState().removeSheet("nope")).toBeNull();
    });

    it("restoreSheet puts the sheet, nodes, and groups back and reactivates it", () => {
        const { sheetId, a, b } = setupRound();
        useRoundStore.getState().groupNodes(sheetId, [a, b], "DAs");
        useRoundStore.getState().setActiveSheet(sheetId);

        const removed = useRoundStore.getState().removeSheet(sheetId)!;
        useRoundStore.getState().restoreSheet(removed);

        const round = useRoundStore.getState().round!;
        expect(round.sheets.some((s) => s.id === sheetId)).toBe(true);
        expect(
            round.nodes
                .filter((n) => n.sheetId === sheetId)
                .map((n) => n.id)
                .sort(),
        ).toEqual([a, b].sort());
        expect(round.groups.filter((g) => g.sheetId === sheetId)).toHaveLength(1);
        expect(useRoundStore.getState().activeSheetId).toBe(sheetId);
    });

    it("restoreSheet is order-independent: an edit between delete and undo is preserved", () => {
        const { sheetId: daId } = setupRound();
        // A second sheet that we'll edit after deleting the first.
        const caseId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        const removed = useRoundStore.getState().removeSheet(daId)!;
        // User keeps working on the other sheet before clicking Undo.
        const fmt = useRoundStore.getState().round!.format;
        const newNode = useRoundStore.getState().addNode({
            sheetId: caseId,
            speechId: fmt.speeches[0].id,
            parentId: null,
        });

        useRoundStore.getState().restoreSheet(removed);

        const round = useRoundStore.getState().round!;
        // The DA sheet is back AND the intervening edit survived.
        expect(round.sheets.some((s) => s.id === daId)).toBe(true);
        expect(round.nodes.some((n) => n.id === newNode)).toBe(true);
    });

    it("restoreSheet ignores a double restore", () => {
        const { sheetId } = setupRound();
        const removed = useRoundStore.getState().removeSheet(sheetId)!;
        useRoundStore.getState().restoreSheet(removed);
        useRoundStore.getState().restoreSheet(removed);
        const round = useRoundStore.getState().round!;
        expect(round.sheets.filter((s) => s.id === sheetId)).toHaveLength(1);
    });
});

describe("flow font preference", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("defaults to plex-sans", () => {
        expect(useRoundStore.getState().flowFont).toBe(DEFAULT_FONT_ID);
    });

    it("setFlowFont updates state and persists to df-display-settings", () => {
        useRoundStore.getState().setFlowFont("plex-sans");
        expect(useRoundStore.getState().flowFont).toBe("plex-sans");
        const raw = window.localStorage.getItem("df-display-settings");
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw as string).flowFont).toBe("plex-sans");
    });

    it("setFlowFont preserves the other display settings", () => {
        useRoundStore.getState().setAutoNumber(false);
        useRoundStore.getState().setFlowFont("dm-sans");
        const saved = JSON.parse(window.localStorage.getItem("df-display-settings") as string);
        expect(saved.autoNumber).toBe(false);
        expect(saved.flowFont).toBe("dm-sans");
    });
});

describe("guide open state", () => {
    it("defaults to closed and toggles", () => {
        expect(useRoundStore.getState().guideOpen).toBe(false);
        useRoundStore.getState().setGuideOpen(true);
        expect(useRoundStore.getState().guideOpen).toBe(true);
        useRoundStore.getState().setGuideOpen(false);
        expect(useRoundStore.getState().guideOpen).toBe(false);
    });
});

it("createRound resets commandPaletteOpen to false", () => {
    useRoundStore.setState({ commandPaletteOpen: true });
    useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    expect(useRoundStore.getState().commandPaletteOpen).toBe(false);
});

describe("loadRound", () => {
    beforeEach(resetStore);

    it("replaces the round and defaults activeSheetId/selection to null", () => {
        freshRound();
        const round = useRoundStore.getState().round!;
        useRoundStore.setState({
            activeSheetId: "stale",
            selection: { sheetId: "stale", speechId: "s", row: 0 },
        });

        useRoundStore.getState().loadRound(round);

        const state = useRoundStore.getState();
        expect(state.round).toBe(round);
        expect(state.activeSheetId).toBeNull();
        expect(state.selection).toBeNull();
    });

    it("applies a provided activeSheetId", () => {
        const sheetId = freshRound();
        const round = useRoundStore.getState().round!;
        useRoundStore.getState().loadRound(round, { activeSheetId: sheetId });
        expect(useRoundStore.getState().activeSheetId).toBe(sheetId);
    });

    it("resets undo history and transient state", () => {
        freshRound();
        const round = useRoundStore.getState().round!;
        useRoundStore.setState({
            pendingSpawn: {
                sheetId: "s",
                speechId: "1ac",
                row: 0,
                parentId: null,
                kind: "sibling",
                preSpawnNodes: undefined,
            },
            moveSource: "n",
            flashNodeId: "n",
        });

        useRoundStore.getState().loadRound(round);

        const state = useRoundStore.getState();
        // A fresh single-node tree whose current snapshot is the loaded round.
        expect(state.history).not.toBeNull();
        expect(state.history!.currentId).toBe(state.history!.rootId);
        expect(state.history!.nodes[state.history!.currentId].snapshot).toBe(round);
        expect(state.pendingSpawn).toBeNull();
        expect(state.moveSource).toBeNull();
        expect(state.flashNodeId).toBeNull();
    });
});

describe("reorderSheets", () => {
    beforeEach(resetStore);

    it("renumbers listed flow sheets by position, preserves group, ignores CX", () => {
        const store = useRoundStore.getState();
        store.createRound({ role: "aff", format: makeFormatByKey("policy") });
        const aId = store.addSheet({ title: "A", group: "aff" });
        const bId = store.addSheet({ title: "B", group: "neg" });
        const cId = store.addSheet({ title: "C", group: "aff" });

        // New order: C, A, B
        store.reorderSheets([cId, aId, bId]);

        const sheets = useRoundStore.getState().round!.sheets;
        const byId = (id: string) => sheets.find((s) => s.id === id)!;
        expect(byId(cId).order).toBe(0);
        expect(byId(aId).order).toBe(1);
        expect(byId(bId).order).toBe(2);
        // group is untouched
        expect(byId(aId).group).toBe("aff");
        expect(byId(bId).group).toBe("neg");
        // CX sheet (created by createRound) keeps order -1, not in the list
        const cx = sheets.find((s) => s.kind === "cx")!;
        expect(cx.order).toBe(-1);
    });

    it("is undoable", () => {
        const store = useRoundStore.getState();
        store.createRound({ role: "aff", format: makeFormatByKey("policy") });
        const aId = store.addSheet({ title: "A", group: "aff" });
        const bId = store.addSheet({ title: "B", group: "neg" });
        const before = useRoundStore.getState().round!.sheets.find((s) => s.id === aId)!.order;

        store.reorderSheets([bId, aId]);
        store.undo();

        const after = useRoundStore.getState().round!.sheets.find((s) => s.id === aId)!.order;
        expect(after).toBe(before);
    });
});

describe("undo tree", () => {
    function fresh() {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
        useRoundStore.getState().setActiveSheet(sheetId);
        const sp = fmt.speeches[1].id;
        return { sheetId, sp };
    }

    it("adds a cell and its first typing burst as a single 'Add' node", () => {
        const { sheetId, sp } = fresh();
        const before = Object.keys(useRoundStore.getState().history!.nodes).length;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 0 });
        // The initial keystrokes coalesce into the "Add" node rather than
        // branching a separate "Type" node.
        useRoundStore.getState().updateNodeText(a, "h");
        useRoundStore.getState().updateNodeText(a, "hi");

        const tree = useRoundStore.getState().history!;
        // The new cell plus its typing burst added exactly one history node.
        expect(Object.keys(tree.nodes)).toHaveLength(before + 1);
        expect(tree.nodes[tree.currentId].label).toBe("Add");
        expect(tree.nodes[tree.currentId].snapshot.nodes.find((n) => n.id === a)!.text).toBe(
            "hi",
        );

        // One undo removes the whole new cell, not just its text.
        useRoundStore.getState().undo();
        expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
    });

    it("diverging after undo preserves the old branch", () => {
        const { sheetId, sp } = fresh();
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 0 });
        // Seal the "Add" burst (as moving the cursor away would) so the edit
        // below branches rather than coalescing into the new cell.
        useRoundStore.getState().setSelection({ sheetId, speechId: sp, row: 0 });
        useRoundStore.getState().updateNodeText(a, "first");
        useRoundStore.getState().undo(); // back before the text edit

        // Divergent edit creates a second branch; the "first" branch is retained.
        useRoundStore.getState().setSelection({ sheetId, speechId: sp, row: 0 });
        useRoundStore.getState().updateNodeText(a, "second");

        const tree = useRoundStore.getState().history!;
        const labels = Object.values(tree.nodes).map((n) => n.snapshot.nodes[0]?.text);
        expect(labels).toContain("first");
        expect(labels).toContain("second");
    });

    it("jumpToHistory restores any node's snapshot", () => {
        const { sheetId, sp } = fresh();
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 0 });
        const root = useRoundStore.getState().history!.rootId;
        useRoundStore.getState().updateNodeText(a, "hello");

        useRoundStore.getState().jumpToHistory(root);
        expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
    });

    it("commitPendingSpawn is a single undo step back to the pre-spawn flow", () => {
        const { sheetId, sp } = fresh();
        const arg1 = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 0 });
        const arg2 = useRoundStore.getState().placeBareNode({ sheetId, speechId: sp, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId: sp, row: 0 });
        useRoundStore.getState().spawnSibling();
        const newId = useRoundStore.getState().commitPendingSpawn("between")!;

        useRoundStore.getState().undo();
        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === newId)).toBeUndefined();
        expect(nodes.find((n) => n.id === arg1)!.row).toBe(0);
        expect(nodes.find((n) => n.id === arg2)!.row).toBe(1);
    });
});
