/**
 * Tests for drop detection logic.
 *
 * Fixtures are built inline — no dependency on format presets.
 */

import { describe, it, expect } from "vitest";

import { detectDrops, dropCountForSheet } from "@/lib/model/drops";
import type { ArgumentNode, Format } from "@/lib/model/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
    overrides: Partial<ArgumentNode> & Pick<ArgumentNode, "id" | "sheetId" | "speechId">,
): ArgumentNode {
    return {
        parentId: null,
        row: 0,
        text: "arg",
        statuses: [],
        bold: false,
        highlight: false,
        ...overrides,
    };
}

/**
 * A 4-speech Policy-like format:
 *   index 0: 1NC  (neg)
 *   index 1: 2AC  (aff)
 *   index 2: block (neg)   ← first neg speech after 2AC
 *   index 3: 1AR  (aff)
 */
const POLICY_FORMAT: Format = {
    id: "policy",
    name: "Policy",
    prepSeconds: { aff: 480, neg: 480 },
    speeches: [
        { id: "sp-1nc", name: "1NC", side: "neg", seconds: 480 },
        { id: "sp-2ac", name: "2AC", side: "aff", seconds: 480 },
        { id: "sp-block", name: "Block", side: "neg", seconds: 480 },
        { id: "sp-1ar", name: "1AR", side: "aff", seconds: 480 },
    ],
};

const SHEET_A = "sheet-a";
const SHEET_B = "sheet-b";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("detectDrops", () => {
    // -------------------------------------------------------------------------
    // Core scenario: 2AC makes 3 args; Block answers #1 and #2 but NOT #3.
    // The opposing side to 2AC (aff) is neg; first neg speech after 2AC = Block.
    // -------------------------------------------------------------------------
    it("marks a 2AC arg as dropped when Block had content but did not answer it", () => {
        // 2AC root arguments
        const arg1 = makeNode({
            id: "arg1",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
        });
        const arg2 = makeNode({
            id: "arg2",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            row: 1,
        });
        const arg3 = makeNode({
            id: "arg3",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            row: 2,
        });

        // Block answers arg1 and arg2, but NOT arg3
        const blk1 = makeNode({
            id: "blk1",
            sheetId: SHEET_A,
            speechId: "sp-block",
            parentId: "arg1",
        });
        const blk2 = makeNode({
            id: "blk2",
            sheetId: SHEET_A,
            speechId: "sp-block",
            parentId: "arg2",
        });
        // Note: no block node with parentId === 'arg3'

        const nodes = [arg1, arg2, arg3, blk1, blk2];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).toContain("arg3");
        expect(dropped).not.toContain("arg1");
        expect(dropped).not.toContain("arg2");
    });

    // -------------------------------------------------------------------------
    // No drop when the opposing speech has no content (speech "didn't happen").
    // -------------------------------------------------------------------------
    it("does NOT flag a 2AC arg when Block has no nodes on the sheet at all", () => {
        const arg1 = makeNode({
            id: "arg1",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
        });
        // No block nodes at all on SHEET_A

        const nodes = [arg1];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).not.toContain("arg1");
        expect(dropped).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // Freeform / terminal: a node in the LAST aff speech (1AR) has no later
    // opposing speech with content → not flagged.
    // -------------------------------------------------------------------------
    it("does NOT flag a node in the last speech (no later opposing speech)", () => {
        const ar1 = makeNode({
            id: "ar1",
            sheetId: SHEET_A,
            speechId: "sp-1ar",
        });

        const nodes = [ar1];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).not.toContain("ar1");
        expect(dropped).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // Nodes on a different sheetId are entirely ignored.
    // -------------------------------------------------------------------------
    it("ignores nodes from a different sheetId", () => {
        // arg on SHEET_B, block answers it — but we query SHEET_A
        const arg1 = makeNode({
            id: "arg1",
            sheetId: SHEET_B,
            speechId: "sp-2ac",
        });
        const blk1 = makeNode({
            id: "blk1",
            sheetId: SHEET_B,
            speechId: "sp-block",
            parentId: "arg1",
        });
        // An unanswered 2AC arg also on SHEET_B
        const arg2 = makeNode({
            id: "arg2",
            sheetId: SHEET_B,
            speechId: "sp-2ac",
            row: 1,
        });

        const nodes = [arg1, blk1, arg2];
        // Query SHEET_A — nothing there, so no drops
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // Only the EARLIEST opposing speech with content is the "answer obligation".
    // If Block is answered but 1AR is not, the 1AR non-answer doesn't count yet
    // unless there is a subsequent neg speech with content.
    //
    // Concretely: 1NC arg, 2AC answers it (child of 1NC arg), Block answers the
    // 2AC response. The 1AR does NOT answer the 2AC response. No later neg speech
    // after 1AR exists — so the 2AC response is NOT dropped (1AR is last speech
    // in our 4-speech format, no neg after it).
    // But also: 1NC arg itself — 2AC answered it, so it is NOT dropped.
    // -------------------------------------------------------------------------
    it("does not flag 2AC answer to 1NC arg when 1AR has no later neg speech with content", () => {
        // 1NC arg (neg)
        const nc1 = makeNode({
            id: "nc1",
            sheetId: SHEET_A,
            speechId: "sp-1nc",
        });
        // 2AC answers nc1
        const ac1 = makeNode({
            id: "ac1",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            parentId: "nc1",
        });
        // Block answers ac1
        const blk1 = makeNode({
            id: "blk1",
            sheetId: SHEET_A,
            speechId: "sp-block",
            parentId: "ac1",
        });
        // 1AR does NOT answer blk1 (no 1AR node with parentId='blk1')
        const ar_unrelated = makeNode({
            id: "ar_unrelated",
            sheetId: SHEET_A,
            speechId: "sp-1ar",
        });

        const nodes = [nc1, ac1, blk1, ar_unrelated];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        // nc1 (neg, 1NC): first aff speech after 1NC = 2AC. 2AC has content. ac1 has parentId=nc1. NOT dropped.
        expect(dropped).not.toContain("nc1");
        // ac1 (aff, 2AC): first neg speech after 2AC = Block. Block has content. blk1 has parentId=ac1. NOT dropped.
        expect(dropped).not.toContain("ac1");
        // blk1 (neg, Block): first aff speech after Block = 1AR. 1AR has content (ar_unrelated). No 1AR node answers blk1 → DROPPED.
        expect(dropped).toContain("blk1");
    });

    // -------------------------------------------------------------------------
    // Empty-text nodes (blank cells left behind by mashing Enter, etc.) are never
    // flagged as dropped — they aren't real arguments.
    // -------------------------------------------------------------------------
    it("never flags an empty-text node as dropped", () => {
        // A blank 2AC cell with a Block that has real content.
        const blank = makeNode({
            id: "blank",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            text: "",
        });
        const realArg = makeNode({
            id: "realArg",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            row: 1,
        });
        const blk1 = makeNode({
            id: "blk1",
            sheetId: SHEET_A,
            speechId: "sp-block",
            parentId: "realArg",
        });

        const nodes = [blank, realArg, blk1];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).not.toContain("blank");
        // The real, answered argument is also not dropped.
        expect(dropped).not.toContain("realArg");
    });

    // A blank cell does not, by itself, make a speech "happen" — so it creates no
    // answer obligation for earlier arguments.
    it("treats a speech holding only blank cells as having no content", () => {
        const arg1 = makeNode({
            id: "arg1",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
        });
        // Block "happened" only as a blank cell — should not obligate an answer.
        const blkBlank = makeNode({
            id: "blkBlank",
            sheetId: SHEET_A,
            speechId: "sp-block",
            text: "",
        });

        const nodes = [arg1, blkBlank];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // dropCountForSheet returns length of detectDrops result.
    // -------------------------------------------------------------------------
    it("dropCountForSheet returns correct count", () => {
        const arg1 = makeNode({
            id: "arg1",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
        });
        const arg2 = makeNode({
            id: "arg2",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            row: 1,
        });
        const arg3 = makeNode({
            id: "arg3",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            row: 2,
        });
        const blk1 = makeNode({
            id: "blk1",
            sheetId: SHEET_A,
            speechId: "sp-block",
            parentId: "arg1",
        });
        // arg2 and arg3 are both unanswered; block has content so both are dropped

        const nodes = [arg1, arg2, arg3, blk1];
        expect(dropCountForSheet(nodes, POLICY_FORMAT, SHEET_A)).toBe(2);
    });

    // -------------------------------------------------------------------------
    // Block nodes themselves: a 1NC root arg answered by 2AC is NOT dropped.
    // -------------------------------------------------------------------------
    it("does not flag a 1NC arg that 2AC answered", () => {
        const nc1 = makeNode({
            id: "nc1",
            sheetId: SHEET_A,
            speechId: "sp-1nc",
        });
        // 2AC answers nc1
        const ac1 = makeNode({
            id: "ac1",
            sheetId: SHEET_A,
            speechId: "sp-2ac",
            parentId: "nc1",
        });

        const nodes = [nc1, ac1];
        const dropped = detectDrops(nodes, POLICY_FORMAT, SHEET_A);

        expect(dropped).not.toContain("nc1");
    });
});

describe("units and drops", () => {
    it("continuation cells are not separate drop obligations", () => {
        // head H (1NC) answered in 2AC; continuation C (unitId H) unanswered
        const nodes = [
            makeNode({ id: "H", sheetId: SHEET_A, speechId: "sp-1nc", row: 0 }),
            makeNode({ id: "C", sheetId: SHEET_A, speechId: "sp-1nc", row: 1, unitId: "H" }),
            makeNode({ id: "ans", sheetId: SHEET_A, speechId: "sp-2ac", row: 0, parentId: "H" }),
        ];
        expect(detectDrops(nodes, POLICY_FORMAT, SHEET_A)).toEqual([]);
    });
});
