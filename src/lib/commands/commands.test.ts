/**
 * Tests for command handlers (TDD-first).
 *
 * Each test sets up a real round in useRoundStore, then calls executeCommand
 * and asserts the resulting store state.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import { executeCommand } from "./commands";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
    });
}

function freshRound() {
    useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    const id = useRoundStore.getState().addSheet({ title: "DA", group: "aff" });
    useRoundStore.getState().setActiveSheet(id);
    return id;
}

// Spawns are deferred (they only arm an intent); these mimic "press Enter /
// Shift+Enter and type" for fixtures, returning the new node's id.
function spawnSiblingAndType(text = "x"): string {
    useRoundStore.getState().spawnSibling();
    return useRoundStore.getState().commitPendingSpawn(text)!;
}
function spawnResponseAndType(text = "x"): string {
    useRoundStore.getState().spawnResponse();
    return useRoundStore.getState().commitPendingSpawn(text)!;
}

describe("executeCommand — no-op safety", () => {
    beforeEach(resetStore);

    it("no-ops when round is null", () => {
        executeCommand("move.down");
        executeCommand("node.sibling");
        executeCommand("row.delete");
        expect(useRoundStore.getState().round).toBeNull();
    });

    it("no-ops navigation when selection is null", () => {
        freshRound();
        useRoundStore.getState().setSelection(null);
        executeCommand("move.down");
        expect(useRoundStore.getState().selection).toBeNull();
    });
});

describe("move.down / move.up (coordinate stepping)", () => {
    beforeEach(resetStore);

    it("move.down moves selection to the next (occupied) row", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("move.down");
        expect(useRoundStore.getState().selection?.row).toBe(1);
    });

    it("move.down steps into the empty cell below", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        // Only one node; the cell below it is empty (white) and reachable.
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("move.down");
        expect(useRoundStore.getState().selection?.row).toBe(1);
    });

    it("move.down keeps moving through empty space below the last argument", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("move.down");
        executeCommand("move.down");
        // Empty cells are reachable — two steps land on row 2, not stuck at 0.
        expect(useRoundStore.getState().selection?.row).toBe(2);
    });

    it("move.up moves selection to the previous (occupied) row", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 1 });

        executeCommand("move.up");
        expect(useRoundStore.getState().selection?.row).toBe(0);
    });

    it("move.up steps into the empty cell above", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 3 });

        executeCommand("move.up");
        expect(useRoundStore.getState().selection?.row).toBe(2);
    });

    it("move.up clamps at row 0", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("move.up");
        expect(useRoundStore.getState().selection?.row).toBe(0);
    });

    it("move.down skips greyed / reserved cells in the same column", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        // Parent in column 0 with TWO real responses in column 1 (children),
        // so the parent's band spans rows 0..1 → column 0 row 1 is reserved.
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        spawnResponseAndType(); // child at (col1, row0)
        spawnSiblingAndType(); // child at (col1, row1)
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        executeCommand("move.down");
        // Row 1 in column 0 is reserved → skipped; land on the open row 2.
        expect(useRoundStore.getState().selection?.row).toBe(2);
    });
});

describe("move.left / move.right (column stepping)", () => {
    beforeEach(resetStore);

    it("move.right steps to the next column in the same row", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[1].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        executeCommand("move.right");
        expect(useRoundStore.getState().selection?.speechId).toBe(speeches[1].id);
    });

    it("move.left steps to the previous column in the same row", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[1].id, row: 0 });

        executeCommand("move.left");
        expect(useRoundStore.getState().selection?.speechId).toBe(speeches[0].id);
    });

    it("move.right steps into an empty column to the right", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        // Nothing placed; column 1 is empty but reachable (not greyed).
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        executeCommand("move.right");
        expect(useRoundStore.getState().selection?.speechId).toBe(speeches[1].id);
    });

    it("move.left steps into an empty column to the left", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[2].id, row: 0 });

        executeCommand("move.left");
        expect(useRoundStore.getState().selection?.speechId).toBe(speeches[1].id);
    });

    it("move.left clamps at the first column", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        executeCommand("move.left");
        expect(useRoundStore.getState().selection?.speechId).toBe(speeches[0].id);
    });

    it("move.left skips a greyed / reserved cell (stays put when only reserved lies left)", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        // arg1 in col0 with two real responses (children) in col1 → col0 row1
        // is reserved (inside arg1's band).
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        spawnResponseAndType(); // child at (col1, row0)
        spawnSiblingAndType(); // child at (col1, row1)
        // Cursor on the second response; nothing occupied left of it on row 1.
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[1].id, row: 1 });

        executeCommand("move.left");
        // The cell to the left (col0,row1) is reserved — must stay put, not land there.
        expect(useRoundStore.getState().selection).toMatchObject({
            speechId: speeches[1].id,
            row: 1,
        });
    });

    it("move.right clamps at the last column", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        const last = speeches[speeches.length - 1];
        useRoundStore.getState().placeBareNode({ sheetId, speechId: last.id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: last.id, row: 0 });

        executeCommand("move.right");
        expect(useRoundStore.getState().selection?.speechId).toBe(last.id);
    });
});

describe("node.sibling", () => {
    beforeEach(resetStore);

    it("on a filled cell arms a deferred sibling and moves the cursor (no node yet)", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("node.sibling");
        const sel = useRoundStore.getState().selection;
        expect(sel?.row).toBe(1);
        expect(sel?.speechId).toBe(speechId);
        // No node created — only the intent is armed.
        expect(useRoundStore.getState().round!.nodes).toHaveLength(1);
        expect(useRoundStore.getState().pendingSpawn).toMatchObject({
            row: 1,
            kind: "sibling",
            parentId: null,
        });
    });

    it("on an empty cell just moves the cursor down (Excel habit), creating nothing", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("node.sibling");
        executeCommand("node.sibling");
        // Mashing Enter on empty cells walks down without spawning anything.
        expect(useRoundStore.getState().selection?.row).toBe(2);
        expect(useRoundStore.getState().round!.nodes).toHaveLength(0);
        expect(useRoundStore.getState().pendingSpawn).toBeNull();
    });

    it("no-ops when selection is null", () => {
        freshRound();
        useRoundStore.getState().setSelection(null);
        executeCommand("node.sibling");
        // Should not throw
    });
});

describe("node.response", () => {
    beforeEach(resetStore);

    it("arms a deferred response in the next column, same row, parent = current", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        const nodeId = useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        executeCommand("node.response");
        const sel = useRoundStore.getState().selection;
        expect(sel?.speechId).toBe(speeches[1].id);
        expect(sel?.row).toBe(0);
        // No node yet; the first keystroke will create it with parent = current.
        expect(useRoundStore.getState().round!.nodes).toHaveLength(1);
        expect(useRoundStore.getState().pendingSpawn).toMatchObject({
            speechId: speeches[1].id,
            row: 0,
            kind: "response",
            parentId: nodeId,
        });
    });
});

describe("row operations", () => {
    beforeEach(resetStore);

    it("row.insertAbove ripples nodes at the cursor row down", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("row.insertAbove");
        const nodes = useRoundStore
            .getState()
            .round!.nodes.filter((n) => n.speechId === speechId && n.sheetId === sheetId);
        expect(nodes.map((n) => n.row).sort()).toEqual([1, 2]);
    });

    it("row.delete removes nodes at the cursor row and ripples up", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("row.delete");
        const nodes = useRoundStore
            .getState()
            .round!.nodes.filter((n) => n.speechId === speechId && n.sheetId === sheetId);
        expect(nodes.length).toBe(1);
        expect(nodes[0].row).toBe(0); // old row 1 shifted up
    });
});

describe("cell.clear", () => {
    beforeEach(resetStore);

    it("orphans children of the cleared cell", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        const a = useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        const child = spawnResponseAndType();
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        executeCommand("cell.clear");

        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === a)).toBeUndefined();
        expect(nodes.find((n) => n.id === child)!.parentId).toBeNull();
    });
});

describe("node.deleteSubtree", () => {
    beforeEach(resetStore);

    it("removes the node and all descendants", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        const root = useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        spawnResponseAndType(); // child
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        executeCommand("node.deleteSubtree");

        const nodes = useRoundStore.getState().round!.nodes;
        expect(nodes.find((n) => n.id === root)).toBeUndefined();
    });
});

describe("edit undo/redo", () => {
    beforeEach(resetStore);

    it("undo restores a deleted node; redo removes it again", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("cell.clear");
        expect(useRoundStore.getState().round!.nodes.length).toBe(0);

        executeCommand("edit.undo");
        expect(useRoundStore.getState().round!.nodes.length).toBe(1);

        executeCommand("edit.redo");
        expect(useRoundStore.getState().round!.nodes.length).toBe(0);
    });
});

describe("status toggles", () => {
    beforeEach(resetStore);

    it("status.toggleConceded toggles the conceded status on occupant", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("status.toggleConceded");
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === a)?.statuses).toContain(
            "conceded",
        );

        executeCommand("status.toggleConceded");
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === a)?.statuses,
        ).not.toContain("conceded");
    });

    it("format.toggleBold toggles bold on the selected node", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("format.toggleBold");
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === a)?.bold).toBe(true);
    });

    it("format.toggleHighlight toggles highlight on the selected node", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("format.toggleHighlight");
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === a)?.highlight).toBe(true);

        executeCommand("format.toggleHighlight");
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === a)?.highlight).toBe(
            false,
        );
    });

    it("no-ops on an empty cell", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("status.toggleConceded");
        // Should not throw or create a node
        expect(useRoundStore.getState().round!.nodes.length).toBe(0);
    });
});

describe("sheet navigation", () => {
    beforeEach(resetStore);

    it("sheet.next / sheet.prev cycle through flow sheets", () => {
        freshRound();
        const s = useRoundStore.getState();
        s.addSheet({ title: "CP", group: "aff" });
        s.addSheet({ title: "K", group: "aff" });
        const flowSheets = useRoundStore
            .getState()
            .round!.sheets.filter((sh) => sh.kind !== "cx")
            .sort((a, b) => a.order - b.order);
        useRoundStore.getState().setActiveSheet(flowSheets[0].id);

        executeCommand("sheet.next");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[1].id);
        executeCommand("sheet.next");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[2].id);
        executeCommand("sheet.next"); // clamp
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[2].id);
        executeCommand("sheet.prev");
        expect(useRoundStore.getState().activeSheetId).toBe(flowSheets[1].id);
    });
});

describe("sheet.newNeg", () => {
    beforeEach(resetStore);

    it("sets selection to the first neg speech at row 0", () => {
        freshRound();
        executeCommand("sheet.newNeg");
        const state = useRoundStore.getState();
        const fmt = state.round!.format;
        const firstNegSpeech = fmt.speeches.find((s) => s.side === "neg")!;
        const newest = state.round!.sheets[state.round!.sheets.length - 1];
        expect(state.selection).toEqual({
            sheetId: newest.id,
            speechId: firstNegSpeech.id,
            row: 0,
        });
    });
});

describe("keyboard grab & move", () => {
    beforeEach(resetStore);

    it("move.grab sets moveSource for the occupant at the selected cell", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("move.grab");
        expect(useRoundStore.getState().moveSource).toBe(a);
    });

    it("move.grab no-ops on an empty cell", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("move.grab");
        expect(useRoundStore.getState().moveSource).toBeNull();
    });

    it("move.cancel clears moveSource and reselects the source node", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        const a = useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        executeCommand("move.grab");

        // Move cursor away
        executeCommand("move.down");
        executeCommand("move.right");

        executeCommand("move.cancel");
        expect(useRoundStore.getState().moveSource).toBeNull();
        expect(useRoundStore.getState().selection).toEqual({
            sheetId,
            speechId,
            row: 0,
        });
    });

    it("move.commit translates the subtree when valid", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        const root = useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        // Create child at speeches[1]:0
        spawnResponseAndType();
        // Grab root
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        executeCommand("move.grab");
        // Move cursor to row 2
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 2 });

        executeCommand("move.commit");
        expect(useRoundStore.getState().moveSource).toBeNull();
        // Root should have moved from row 0 to row 2
        const movedRoot = useRoundStore.getState().round!.nodes.find((n) => n.id === root)!;
        expect(movedRoot.row).toBe(2);
    });

    it("move.down in grab-move steps one row at a time onto empty cells", () => {
        // Drop targets are legal on empty cells, so arrows must NOT skip them.
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        executeCommand("move.grab");

        executeCommand("move.down");
        expect(useRoundStore.getState().selection?.row).toBe(1);
    });

    it("move.right in grab-move steps one column at a time onto empty cells", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[0].id, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });
        executeCommand("move.grab");

        executeCommand("move.right");
        expect(useRoundStore.getState().selection?.speechId).toBe(speeches[1].id);
    });
});

describe("jump navigation (Excel data-edge)", () => {
    beforeEach(resetStore);

    it("nav.jumpDown extends to the end of a contiguous run", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 0 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 1 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 2 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 5 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });

        executeCommand("nav.jumpDown");
        expect(useRoundStore.getState().selection?.row).toBe(2);
    });

    it("nav.jumpDown from the run end skips the gap to the next filled cell", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 2 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 5 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 2 });

        executeCommand("nav.jumpDown");
        expect(useRoundStore.getState().selection?.row).toBe(5);
    });

    it("nav.jumpUp jumps to row 0 when nothing is filled above", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 5 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 3 });

        executeCommand("nav.jumpUp");
        expect(useRoundStore.getState().selection?.row).toBe(0);
    });

    it("nav.jumpHome jumps to the top-left cell", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[2].id, row: 4 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[2].id, row: 4 });

        executeCommand("nav.jumpHome");
        expect(useRoundStore.getState().selection).toMatchObject({
            speechId: speeches[0].id,
            row: 0,
        });
    });

    it("nav.jumpEnd jumps to the bottom-right-most filled cell", () => {
        const sheetId = freshRound();
        const speeches = useRoundStore.getState().round!.format.speeches;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[0].id, row: 5 });
        useRoundStore.getState().placeBareNode({ sheetId, speechId: speeches[2].id, row: 5 });
        useRoundStore.getState().setSelection({ sheetId, speechId: speeches[0].id, row: 0 });

        executeCommand("nav.jumpEnd");
        expect(useRoundStore.getState().selection).toMatchObject({
            speechId: speeches[2].id,
            row: 5,
        });
    });

    it("jump is a no-op during grab-move", () => {
        const sheetId = freshRound();
        const speechId = useRoundStore.getState().round!.format.speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId, row: 5 });
        useRoundStore.getState().setSelection({ sheetId, speechId, row: 0 });
        useRoundStore.setState({ moveSource: "anything" });

        executeCommand("nav.jumpDown");
        // Selection unchanged while grabbing.
        expect(useRoundStore.getState().selection?.row).toBe(0);
        useRoundStore.setState({ moveSource: null });
    });
});

describe("palette.open", () => {
    beforeEach(() => resetStore());

    it("opens the command palette", () => {
        freshRound();
        expect(useRoundStore.getState().commandPaletteOpen).toBe(false);
        executeCommand("palette.open");
        expect(useRoundStore.getState().commandPaletteOpen).toBe(true);
    });
});
