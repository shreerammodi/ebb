/**
 * Tests for command handlers (TDD-first).
 *
 * Each test sets up a real round in useRoundStore, then calls executeCommand
 * and asserts the resulting store state.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import { executeCommand } from "./commands";

const BLANK_STATE = {
    round: null,
    activeSheetId: null,
    mode: "normal" as const,
    selection: null,
    keymapName: "vim" as const,
    quickSwitcherOpen: false,
    settingsOpen: false,
    renamingSheetId: null,
};

function resetStore() {
    useRoundStore.setState(BLANK_STATE);
}

/** Sets up a policy round, one sheet, and returns useful ids. */
function setupRound() {
    const fmt = makeFormatByKey("policy");
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: fmt });
    const sheetId = useRoundStore
        .getState()
        .addSheet({ title: "DA", group: "neg" });
    return { fmt, sheetId, speeches: fmt.speeches };
}

describe("executeCommand — no-op safety", () => {
    beforeEach(resetStore);

    it("no-ops when round is null", () => {
        executeCommand("move.down");
        executeCommand("node.delete");
        executeCommand("arg.newRoot");
        expect(useRoundStore.getState().round).toBeNull();
    });

    it("no-ops navigation when selection is null", () => {
        setupRound();
        useRoundStore.getState().setSelection(null);
        executeCommand("move.down");
        expect(useRoundStore.getState().selection).toBeNull();
    });
});

describe("move.down / move.up", () => {
    beforeEach(resetStore);

    it("move.down moves selection to the node below in the column", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id; // 1NC
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("move.down");
        expect(useRoundStore.getState().selection?.nodeId).toBe(b);
    });

    it("move.up moves selection to the node above", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: b });

        executeCommand("move.up");
        expect(useRoundStore.getState().selection?.nodeId).toBe(a);
    });

    it("move.down crosses bands by physical placement, not per-column order", () => {
        setupRound();
        const store = () => useRoundStore.getState();
        const fmt = store().round!.format;
        const sheetId = store().addSheet({ title: "Case", group: "aff" });
        const pCol = fmt.speeches[0].id; // parent column
        const cCol = fmt.speeches[1].id; // child column (one to the right)

        const A = store().addNode({ sheetId, speechId: pCol, parentId: null });
        const B = store().addNode({ sheetId, speechId: pCol, parentId: null });
        // Add B's child first so b1 gets the lower cCol order, then a1. Physically a1
        // sits above b1 (band A precedes band B), but a1 has the HIGHER per-column
        // order. Old order-based nodeBelowInColumn returns null (nothing with a
        // greater cCol order than a1); placement-based logic returns b1.
        const b1 = store().addNode({ sheetId, speechId: cCol, parentId: B });
        const a1 = store().addNode({ sheetId, speechId: cCol, parentId: A });
        store().setSelection({ sheetId, speechId: cCol, nodeId: a1 });
        executeCommand("move.down");
        expect(store().selection?.nodeId).toBe(b1);
    });

    it("move.down no-ops at the bottom of the column", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });
        executeCommand("move.down");
        expect(useRoundStore.getState().selection?.nodeId).toBe(a);
    });
});

describe("move.left / move.right", () => {
    beforeEach(resetStore);

    it("move.left selects the parent", () => {
        const { sheetId, speeches } = setupRound();
        const parentSp = speeches[1].id;
        const childSp = speeches[2].id;
        const p = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: parentSp, parentId: null });
        const c = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: childSp, parentId: p });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: childSp, nodeId: c });

        executeCommand("move.left");
        const sel = useRoundStore.getState().selection;
        expect(sel?.nodeId).toBe(p);
        expect(sel?.speechId).toBe(parentSp);
    });

    it("move.right selects the first child", () => {
        const { sheetId, speeches } = setupRound();
        const parentSp = speeches[1].id;
        const childSp = speeches[2].id;
        const p = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: parentSp, parentId: null });
        const c = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: childSp, parentId: p });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: parentSp, nodeId: p });

        executeCommand("move.right");
        const sel = useRoundStore.getState().selection;
        expect(sel?.nodeId).toBe(c);
        expect(sel?.speechId).toBe(childSp);
    });

    it("move.left no-ops when selection.nodeId is empty", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[0].id;
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: "" });
        executeCommand("move.left");
        expect(useRoundStore.getState().selection?.nodeId).toBe("");
    });
});

describe("edit.enter / edit.exit", () => {
    beforeEach(resetStore);

    it("edit.enter on empty cell creates a root node and enters insert mode", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[0].id;
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: "" });

        executeCommand("edit.enter");
        const st = useRoundStore.getState();
        expect(st.mode).toBe("insert");
        expect(st.selection?.nodeId).not.toBe("");
        const created = st.round!.nodes.find(
            (n) => n.id === st.selection!.nodeId,
        );
        expect(created?.parentId).toBeNull();
        expect(created?.speechId).toBe(sp);
    });

    it("edit.enter on an existing node just enters insert mode", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[0].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("edit.enter");
        const st = useRoundStore.getState();
        expect(st.mode).toBe("insert");
        expect(st.selection?.nodeId).toBe(a);
    });

    it("edit.exit returns to normal mode", () => {
        setupRound();
        useRoundStore.getState().setMode("insert");
        executeCommand("edit.exit");
        expect(useRoundStore.getState().mode).toBe("normal");
    });
});

describe("node.addAnswer", () => {
    beforeEach(resetStore);

    it("adds a sibling with the same parentId and selects it in insert mode", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("node.addAnswer");
        const st = useRoundStore.getState();
        expect(st.mode).toBe("insert");
        const newId = st.selection!.nodeId;
        expect(newId).not.toBe(a);
        const created = st.round!.nodes.find((n) => n.id === newId);
        expect(created?.parentId).toBeNull();
        expect(created?.speechId).toBe(sp);
    });
});

describe("node.answerAcross", () => {
    beforeEach(resetStore);

    it("creates a child in the next opposing speech and selects it", () => {
        const { sheetId, speeches } = setupRound();
        const affSp = speeches[0].id; // 1AC aff
        const negSp = speeches[1].id; // 1NC neg
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: affSp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: affSp, nodeId: a });

        executeCommand("node.answerAcross");
        const st = useRoundStore.getState();
        expect(st.mode).toBe("insert");
        const newId = st.selection!.nodeId;
        const created = st.round!.nodes.find((n) => n.id === newId);
        expect(created?.parentId).toBe(a);
        expect(created?.speechId).toBe(negSp);
        expect(st.selection?.speechId).toBe(negSp);
    });

    it("no-ops when there is no opposing speech", () => {
        const { sheetId, speeches } = setupRound();
        const last = speeches[speeches.length - 1].id; // 2AR aff, last
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: last, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: last, nodeId: a });
        const before = useRoundStore.getState().round!.nodes.length;

        executeCommand("node.answerAcross");
        expect(useRoundStore.getState().round!.nodes.length).toBe(before);
    });
});

describe("arg.newRoot", () => {
    beforeEach(resetStore);

    it("adds a root node in the current speech and selects it", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[2].id;
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: "" });

        executeCommand("arg.newRoot");
        const st = useRoundStore.getState();
        expect(st.mode).toBe("insert");
        const created = st.round!.nodes.find(
            (n) => n.id === st.selection!.nodeId,
        );
        expect(created?.parentId).toBeNull();
        expect(created?.speechId).toBe(sp);
    });

    it("falls back to the first speech of the format when no selection", () => {
        const { sheetId, speeches } = setupRound();
        useRoundStore.getState().setActiveSheet(sheetId);
        useRoundStore.getState().setSelection(null);

        executeCommand("arg.newRoot");
        const st = useRoundStore.getState();
        const created = st.round!.nodes.find(
            (n) => n.id === st.selection!.nodeId,
        );
        expect(created?.speechId).toBe(speeches[0].id);
    });
});

describe("node.delete", () => {
    beforeEach(resetStore);

    it("removes the selected node and keeps the cursor on the now-empty cell", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("node.delete");
        const st = useRoundStore.getState();
        expect(st.round!.nodes.find((n) => n.id === a)).toBeUndefined();
        // Cursor stays in the flow on the empty cell in the same column, not null.
        expect(st.selection).toEqual({ sheetId, speechId: sp, nodeId: "" });
    });

    it("moves the cursor to the neighbor above after deleting a stacked node", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: sp,
                parentId: null,
                insertAfterOrder: 0,
            });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: b });

        executeCommand("node.delete");
        const st = useRoundStore.getState();
        expect(st.round!.nodes.find((n) => n.id === b)).toBeUndefined();
        expect(st.selection).toEqual({ sheetId, speechId: sp, nodeId: a });
    });
});

describe("status toggles", () => {
    beforeEach(resetStore);

    it("status.toggleConceded toggles the conceded status", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("status.toggleConceded");
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === a)
                ?.statuses,
        ).toContain("conceded");

        executeCommand("status.toggleConceded");
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === a)
                ?.statuses,
        ).not.toContain("conceded");
    });

    it("status.toggleExtended toggles the extended status", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("status.toggleExtended");
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === a)
                ?.statuses,
        ).toContain("extended");
    });

    it("format.toggleBold toggles bold on the selected node", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const nodeId = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId });

        executeCommand("format.toggleBold");
        const node = useRoundStore
            .getState()
            .round!.nodes.find((n) => n.id === nodeId)!;
        expect(node.bold).toBe(true);
    });
});

describe("sheet navigation", () => {
    beforeEach(resetStore);

    function threeSheets() {
        setupRound();
        const s = useRoundStore.getState();
        // setupRound already added one sheet ('DA'). Add two more.
        const s2 = s.addSheet({ title: "CP", group: "neg" });
        const s3 = s.addSheet({ title: "K", group: "neg" });
        // Flow-only sheets sorted by order (CX excluded from cycling).
        const flowSheets = useRoundStore
            .getState()
            .round!.sheets.filter((sh) => sh.kind !== "cx")
            .slice()
            .sort((a, b) => a.order - b.order);
        return { flowSheets, s2, s3 };
    }

    it("sheet.next activates the next sheet by order (clamped)", () => {
        const { flowSheets } = threeSheets();
        useRoundStore.getState().setActiveSheet(flowSheets[0].id);
        executeCommand("sheet.next");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[1].id);
        executeCommand("sheet.next");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[2].id);
        executeCommand("sheet.next"); // clamp
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[2].id);
    });

    it("sheet.prev activates the previous sheet (clamped)", () => {
        const { flowSheets } = threeSheets();
        useRoundStore.getState().setActiveSheet(flowSheets[2].id);
        executeCommand("sheet.prev");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[1].id);
        executeCommand("sheet.prev");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[0].id);
        executeCommand("sheet.prev"); // clamp
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[0].id);
    });

    it("sheet.jump2 activates the 2nd flow sheet", () => {
        const { flowSheets } = threeSheets();
        executeCommand("sheet.jump2");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[1].id);
    });

    it("sheet.jump9 no-ops when out of range", () => {
        const { flowSheets } = threeSheets();
        useRoundStore.getState().setActiveSheet(flowSheets[0].id);
        executeCommand("sheet.jump9");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[0].id);
    });
});

describe("CX command behavior", () => {
    beforeEach(resetStore);

    /** Returns the CX sheet id from the current round. */
    function getCxSheetId(): string {
        const round = useRoundStore.getState().round!;
        const cxSheet = round.sheets.find((s) => s.kind === "cx");
        if (!cxSheet) throw new Error("No CX sheet found");
        return cxSheet.id;
    }

    it("answer-across from a CX question creates a child in the paired response column", () => {
        setupRound();
        const cxId = getCxSheetId();
        const qId = useRoundStore.getState().addNode({
            sheetId: cxId,
            speechId: "cx-1ac-q",
            parentId: null,
        });
        useRoundStore
            .getState()
            .setSelection({ sheetId: cxId, speechId: "cx-1ac-q", nodeId: qId });

        executeCommand("node.answerAcross");

        const st = useRoundStore.getState();
        expect(st.mode).toBe("insert");
        const newId = st.selection!.nodeId;
        expect(newId).not.toBe(qId);
        const created = st.round!.nodes.find((n) => n.id === newId);
        expect(created?.parentId).toBe(qId);
        expect(created?.speechId).toBe("cx-1ac-r");
    });

    it("does not toggle conceded/extended on a CX node", () => {
        setupRound();
        const cxId = getCxSheetId();
        const nodeId = useRoundStore.getState().addNode({
            sheetId: cxId,
            speechId: "cx-1ac-q",
            parentId: null,
        });
        useRoundStore
            .getState()
            .setSelection({ sheetId: cxId, speechId: "cx-1ac-q", nodeId });

        executeCommand("status.toggleConceded");

        const node = useRoundStore
            .getState()
            .round!.nodes.find((n) => n.id === nodeId);
        expect(node?.statuses).toEqual([]);
    });

    it("sheet.next skips the CX sheet", () => {
        setupRound(); // creates CX sheet + 1 flow sheet ('DA')
        const s = useRoundStore.getState();
        const s2 = s.addSheet({ title: "CP", group: "neg" });
        const flowSheets = useRoundStore
            .getState()
            .round!.sheets.filter((sh) => sh.kind !== "cx")
            .slice()
            .sort((a, b) => a.order - b.order);
        // Start on the first flow sheet and verify next goes to second flow (not CX)
        useRoundStore.getState().setActiveSheet(flowSheets[0].id);
        executeCommand("sheet.next");
        const nextId = useRoundStore.getState().activeSheetId;
        expect(nextId).toBe(flowSheets[1].id);
        // Verify the CX sheet was never landed on
        const cxId = getCxSheetId();
        expect(nextId).not.toBe(cxId);
    });
});

describe("modal flags", () => {
    beforeEach(resetStore);

    it("sheet.quickSwitch opens the quick switcher", () => {
        setupRound();
        executeCommand("sheet.quickSwitch");
        expect(useRoundStore.getState().quickSwitcherOpen).toBe(true);
    });

    it("settings.open opens settings", () => {
        setupRound();
        executeCommand("settings.open");
        expect(useRoundStore.getState().settingsOpen).toBe(true);
    });
});

describe("sheet.newAff", () => {
    beforeEach(resetStore);

    it("adds an aff sheet and makes it active", () => {
        setupRound();
        const before = useRoundStore.getState().round!.sheets.length;
        executeCommand("sheet.newAff");
        const state = useRoundStore.getState();
        const sheets = state.round!.sheets;
        expect(sheets).toHaveLength(before + 1);
        const newest = sheets[sheets.length - 1];
        expect(newest.group).toBe("aff");
        expect(state.activeSheetId).toBe(newest.id);
    });

    it("no-ops when round is null", () => {
        executeCommand("sheet.newAff");
        expect(useRoundStore.getState().round).toBeNull();
    });
});

describe("sheet.newNeg", () => {
    beforeEach(resetStore);

    it("adds a neg sheet and makes it active", () => {
        setupRound();
        executeCommand("sheet.newNeg");
        const state = useRoundStore.getState();
        const newest = state.round!.sheets[state.round!.sheets.length - 1];
        expect(newest.group).toBe("neg");
        expect(state.activeSheetId).toBe(newest.id);
    });

    it("sets selection to the first neg speech", () => {
        setupRound();
        executeCommand("sheet.newNeg");
        const state = useRoundStore.getState();
        const fmt = state.round!.format;
        const firstNegSpeech = fmt.speeches.find((s) => s.side === "neg")!;
        const newest = state.round!.sheets[state.round!.sheets.length - 1];
        expect(state.selection).toEqual({
            sheetId: newest.id,
            speechId: firstNegSpeech.id,
            nodeId: "",
        });
    });

    it("no-ops when round is null", () => {
        executeCommand("sheet.newNeg");
        expect(useRoundStore.getState().round).toBeNull();
    });
});

describe("edit.undo / edit.redo", () => {
    beforeEach(resetStore);

    it("undo restores a deleted node; redo removes it again", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        // delete the node
        executeCommand("node.delete");
        expect(useRoundStore.getState().round!.nodes.length).toBe(0);

        // undo restores it
        executeCommand("edit.undo");
        expect(useRoundStore.getState().round!.nodes.length).toBe(1);

        // redo removes it again
        executeCommand("edit.redo");
        expect(useRoundStore.getState().round!.nodes.length).toBe(0);
    });
});

describe("sheet.rename", () => {
    beforeEach(resetStore);

    it("sets renamingSheetId to the active sheet id", () => {
        const { sheetId } = setupRound();
        useRoundStore.getState().setActiveSheet(sheetId);
        executeCommand("sheet.rename");
        expect(useRoundStore.getState().renamingSheetId).toBe(sheetId);
    });

    it("no-ops when there is no active sheet", () => {
        setupRound();
        useRoundStore.setState({ activeSheetId: null });
        executeCommand("sheet.rename");
        expect(useRoundStore.getState().renamingSheetId).toBeNull();
    });
});

describe("straightDown behavior", () => {
    beforeEach(() => {
        resetStore();
        useRoundStore.setState({ straightDown: true });
    });
    afterEach(() => {
        useRoundStore.setState({ straightDown: false });
    });

    it("node.addAnswer creates a ROOT cell below even from a child node", () => {
        const { sheetId, speeches } = setupRound();
        const affSp = speeches[0].id; // 1AC aff
        const negSp = speeches[1].id; // 1NC neg
        const root = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: affSp, parentId: null });
        // A pre-existing child (e.g. created before straight-down was turned on).
        const child = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: negSp, parentId: root });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: negSp, nodeId: child });

        executeCommand("node.addAnswer");
        const st = useRoundStore.getState();
        const created = st.round!.nodes.find(
            (n) => n.id === st.selection!.nodeId,
        );
        expect(created?.parentId).toBeNull();
        expect(created?.speechId).toBe(negSp);
    });

    it("node.answerAcross is a no-op on a flow sheet", () => {
        const { sheetId, speeches } = setupRound();
        const affSp = speeches[0].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: affSp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: affSp, nodeId: a });
        const before = useRoundStore.getState().round!.nodes.length;

        executeCommand("node.answerAcross");
        expect(useRoundStore.getState().round!.nodes.length).toBe(before);
    });

    it("node.addAnswer moves DOWN to the existing cell below instead of inserting", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[0].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });
        const before = useRoundStore.getState().round!.nodes.length;

        // Enter from `a` (which has `b` below it) should select `b`, not create a node.
        executeCommand("node.addAnswer");
        const st = useRoundStore.getState();
        expect(st.round!.nodes.length).toBe(before);
        expect(st.selection!.nodeId).toBe(b);
    });

    it("move.down from the bottom node selects the empty entry cell below", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id; // 1NC — a valid column on this neg sheet
        useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: b });

        executeCommand("move.down");
        const sel = useRoundStore.getState().selection!;
        expect(sel.nodeId).toBe("");
        expect(sel.speechId).toBe(sp);
        expect(typeof sel.row).toBe("number");
    });

    it("move.up from the empty entry cell returns to the bottom node", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[1].id;
        useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: "", row: 2 });

        executeCommand("move.up");
        expect(useRoundStore.getState().selection!.nodeId).toBe(b);
    });

    it("node.addAnswer creates a new cell below only when at the bottom", () => {
        const { sheetId, speeches } = setupRound();
        const sp = speeches[0].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        const b = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: b });
        const before = useRoundStore.getState().round!.nodes.length;

        // Enter from `b` (the bottom cell) spawns a fresh root below it.
        executeCommand("node.addAnswer");
        const st = useRoundStore.getState();
        expect(st.round!.nodes.length).toBe(before + 1);
        const created = st.round!.nodes.find(
            (n) => n.id === st.selection!.nodeId,
        );
        expect(created?.id).not.toBe(a);
        expect(created?.id).not.toBe(b);
        expect(created?.parentId).toBeNull();
        expect(created?.speechId).toBe(sp);
    });
});

describe("keyboard grab & move", () => {
    beforeEach(resetStore);

    // An AFF sheet's columns == fmt.speeches in order (1AC, 1NC, 2AC, ...), so
    // speech indices map directly to grid columns. A neg sheet would slice from
    // the first neg speech and shift the indices.
    function setupAff() {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });
        return { fmt, sheetId, speeches: fmt.speeches };
    }

    it("move.grab sets moveSource for a selected node", () => {
        const { sheetId, speeches } = setupAff();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });

        executeCommand("move.grab");
        expect(useRoundStore.getState().moveSource).toBe(a);
    });

    it("move.grab no-ops on an empty cell", () => {
        const { sheetId, speeches } = setupAff();
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[0].id, nodeId: "" });

        executeCommand("move.grab");
        expect(useRoundStore.getState().moveSource).toBeNull();
    });

    it("move.cancel clears moveSource and reselects the source", () => {
        const { sheetId, speeches } = setupAff();
        const sp = speeches[1].id;
        const a = useRoundStore
            .getState()
            .addNode({ sheetId, speechId: sp, parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: sp, nodeId: a });
        executeCommand("move.grab");
        // Cursor navigated away to some other cell.
        useRoundStore
            .getState()
            .setSelection({
                sheetId,
                speechId: speeches[0].id,
                nodeId: "",
                row: 0,
            });

        executeCommand("move.cancel");
        expect(useRoundStore.getState().moveSource).toBeNull();
        expect(useRoundStore.getState().selection?.nodeId).toBe(a);
    });

    it("move.commit reparents the grabbed node under a valid earlier-column target", () => {
        const { sheetId, speeches } = setupAff();
        const root = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: speeches[0].id,
                parentId: null,
                text: "root",
            });
        const child = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: speeches[2].id,
                parentId: null,
                text: "child",
            });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[2].id, nodeId: child });
        executeCommand("move.grab");
        // Target cursor lands on the col-0 root.
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[0].id, nodeId: root });

        executeCommand("move.commit");
        expect(useRoundStore.getState().moveSource).toBeNull();
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === child)!
                .parentId,
        ).toBe(root);
        expect(useRoundStore.getState().flashNodeId).toBe(child);
    });

    it("move.commit stays in move mode on an invalid (later-column) target", () => {
        const { sheetId, speeches } = setupAff();
        const root = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: speeches[0].id,
                parentId: null,
                text: "root",
            });
        const later = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: speeches[2].id,
                parentId: null,
                text: "later",
            });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[0].id, nodeId: root });
        executeCommand("move.grab");
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[2].id, nodeId: later });

        executeCommand("move.commit");
        // A later-column node can't be a parent → no-op, still grabbed.
        expect(useRoundStore.getState().moveSource).toBe(root);
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === root)!
                .parentId,
        ).toBeNull();
    });

    it("move.grab no-ops on a CX sheet", () => {
        setupAff();
        const cxId = useRoundStore
            .getState()
            .round!.sheets.find((s) => s.kind === "cx")!.id;
        const q = useRoundStore
            .getState()
            .addNode({ sheetId: cxId, speechId: "cx-1ac-q", parentId: null });
        useRoundStore
            .getState()
            .setSelection({ sheetId: cxId, speechId: "cx-1ac-q", nodeId: q });

        executeCommand("move.grab");
        expect(useRoundStore.getState().moveSource).toBeNull();
    });

    it("spatial nav: move.right steps the target cursor to the next column while moving", () => {
        const { sheetId, speeches } = setupAff();
        const a = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: speeches[0].id,
                parentId: null,
                text: "a",
            });
        const b = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: speeches[1].id,
                parentId: a,
                text: "b",
            });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: speeches[0].id, nodeId: a });
        executeCommand("move.grab");

        executeCommand("move.right");
        expect(useRoundStore.getState().selection?.speechId).toBe(
            speeches[1].id,
        );
        expect(useRoundStore.getState().selection?.nodeId).toBe(b);
    });
});
