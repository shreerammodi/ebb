import { beforeEach, describe, expect, it } from "vitest";

import { seedDoc } from "@/lib/collab/doc";
import { applyOp, type OpContext } from "@/lib/collab/ops";
import { planRemoteApply, type ApplyContext } from "@/lib/collab/remoteApply";
import { createClock } from "@/lib/collab/stamp";
import type { CollabDoc } from "@/lib/collab/types";
import { modelCol } from "@/lib/grid/colSpace";
import { makeFlowRound, type FlowRound } from "@/lib/model/flow";

let round: FlowRound;
let sheetId: string;
let otherSheetId: string;
let before: CollabDoc;
let sam: OpContext;

beforeEach(() => {
    round = makeFlowRound({});
    const flow = round.sheets.find((s) => s.kind !== "cx")!;
    const cx = round.sheets.find((s) => s.kind === "cx")!;
    sheetId = flow.id;
    otherSheetId = cx.id;
    flow.data = [
        ["a0", "b0"],
        ["a1", "b1"],
        ["a2", "b2"],
    ];
    cx.data = [["x0"]];
    before = seedDoc(round);
    let t = 9_000;
    sam = { actor: "sam", clock: createClock("sam", () => t++) };
});

function ctx(over: Partial<ApplyContext> = {}): ApplyContext {
    return {
        editorOpen: false,
        editorCell: null,
        selection: { sheetId, col: modelCol(0), row: 2 },
        activeSheetId: sheetId,
        ...over,
    };
}

function after(...ops: Parameters<typeof applyOp>[1][]): CollabDoc {
    let doc = before;
    for (const op of ops) doc = applyOp(doc, op, sam);
    return doc;
}

describe("the hard rule", () => {
    it("never scrolls, whatever happened", () => {
        const plans = [
            planRemoteApply(before, after({ kind: "insertRow", sheetId, row: 0 }), ctx()),
            planRemoteApply(before, after({ kind: "removeRow", sheetId, row: 0 }), ctx()),
            planRemoteApply(
                before,
                after({ kind: "cellText", sheetId, col: 0, row: 0, text: "x" }),
                ctx(),
            ),
            planRemoteApply(before, after({ kind: "removeSheet", sheetId }), ctx()),
        ];
        for (const plan of plans) expect(plan.scroll).toBe(false);
    });
});

describe("a partner edits a cell you are not in", () => {
    it("writes it, and leaves the selection alone", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "cellText", sheetId, col: 1, row: 0, text: "theirs" }),
            ctx(),
        );
        expect(plan.writeCells).toBe(true);
        expect(plan.selectRow).toBeNull();
        expect(plan.deferredCells).toEqual([]);
    });

    it("reports a structural change by column even without a selection", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "insertCell", sheetId, col: 1, row: 1 }),
            ctx({ selection: null }),
        );
        expect(plan.structural).toEqual([
            {
                kind: "insertRow",
                at: 1,
                amount: 1,
                scope: { kind: "column", col: 1 },
            },
        ]);
    });
});

describe("a partner edits the cell your editor is open on", () => {
    it("defers that cell and writes nothing over your text", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "cellText", sheetId, col: 0, row: 1, text: "theirs" }),
            ctx({ editorOpen: true, editorCell: { sheetId, col: modelCol(0), row: 1 } }),
        );
        expect(plan.deferredCells).toHaveLength(1);
        expect(plan.deferredCells[0]).toMatchObject({ col: 0 });
    });

    it("still writes the cells the editor is not on", () => {
        const plan = planRemoteApply(
            before,
            after(
                { kind: "cellText", sheetId, col: 0, row: 1, text: "theirs" },
                { kind: "cellText", sheetId, col: 1, row: 2, text: "elsewhere" },
            ),
            ctx({ editorOpen: true, editorCell: { sheetId, col: modelCol(0), row: 1 } }),
        );
        expect(plan.writeCells).toBe(true);
        expect(plan.deferredCells).toHaveLength(1);
    });
});

describe("a partner inserts above your cursor", () => {
    it("moves the selection down one and clears no history", () => {
        const plan = planRemoteApply(before, after({ kind: "insertRow", sheetId, row: 1 }), ctx());
        expect(plan.selectRow).toBe(3);
    });

    it("reports the structural change so the undo stack can be corrected", () => {
        const plan = planRemoteApply(before, after({ kind: "insertRow", sheetId, row: 1 }), ctx());
        expect(plan.structural).toEqual([
            { kind: "insertRow", at: 1, amount: 1, scope: { kind: "row" } },
        ]);
    });
});

describe("a partner deletes the row you sit in", () => {
    it("holds the cursor's index rather than jumping it", () => {
        const plan = planRemoteApply(before, after({ kind: "removeRow", sheetId, row: 2 }), ctx());
        expect(plan.selectRow).toBeNull();
    });
});

describe("a partner touches a sheet you are not looking at", () => {
    it("never moves your selection", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "insertRow", sheetId: otherSheetId, row: 0 }),
            ctx(),
        );
        expect(plan.selectRow).toBeNull();
    });

    it("reports no structural change for your sheet", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "insertRow", sheetId: otherSheetId, row: 0 }),
            ctx(),
        );
        expect(plan.structural).toEqual([]);
    });
});

describe("a partner deletes the sheet you are viewing", () => {
    it("names a neighbour to move to", () => {
        const plan = planRemoteApply(before, after({ kind: "removeSheet", sheetId }), ctx());
        expect(plan.leftSheet).toBe(sheetId);
    });

    it("says nothing when the deleted sheet is not the one you are on", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "removeSheet", sheetId: otherSheetId }),
            ctx(),
        );
        expect(plan.leftSheet).toBeNull();
    });
});

describe("no selection at all", () => {
    it("plans no selection change", () => {
        const plan = planRemoteApply(
            before,
            after({ kind: "insertRow", sheetId, row: 0 }),
            ctx({ selection: null }),
        );
        expect(plan.selectRow).toBeNull();
    });
});
