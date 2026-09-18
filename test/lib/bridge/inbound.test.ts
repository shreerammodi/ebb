import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleBridgeRequest, resetRevealCycle } from "@/lib/bridge/inbound";
import { projectDoc } from "@/lib/collab/doc";
import { clearReplica, getReplica, seedReplica } from "@/lib/collab/replica";
import { setActiveHot } from "@/lib/grid/hotInstance";
import { resetMetaUndo } from "@/lib/grid/metaUndo";
import { makeFlowRound, type CellMeta } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { metaStore } from "../../support/fakeHot";

/**
 * The slice of Handsontable the inbound routes touch, backed by plain arrays
 * so a write can be asserted on text, decoration and provenance at once.
 */
function makeGrid(rows: number, cols: number) {
    const data: (string | null)[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => null),
    );
    const meta = metaStore();
    let selected: [number, number] = [0, 0];

    const hot = {
        countRows: () => data.length,
        countCols: () => cols,
        getDataAtCell: (row: number, col: number) => data[row]?.[col] ?? null,
        setDataAtCell: (changes: [number, number, string | null][]) => {
            for (const [row, col, value] of changes) {
                if (data[row]) data[row][col] = value;
            }
        },
        getCellMeta: meta.getCellMeta,
        setCellMeta: meta.setCellMeta,
        getSelectedLast: () => selected,
        selectCell: (row: number, col: number) => {
            selected = [row, col];
        },
        alter: (_action: string, _index: number, amount: number) => {
            for (let i = 0; i < amount; i++) data.push(Array.from({ length: cols }, () => null));
        },
        render: vi.fn(),
    };
    return {
        hot,
        data,
        at: meta.at,
        select: (row: number, col: number) => hot.selectCell(row, col),
    };
}

const send = (items: unknown[], mode = "column", space = 0) =>
    handleBridgeRequest("flow", { mode, docTitle: "AT - Cap K", items, space });

const tag = { kind: "tag", text: "Perm solves", source: "cmsrc1.a", key: "doc-1|perm solves" };
const cite = { kind: "cite", text: "Smith 24", source: "cmsrc1.b", key: "doc-1|smith 24" };
const block = { kind: "block", text: "Cap K", source: "cmsrc1.c", key: "doc-1|cap k" };

function loadRound() {
    useFlowStore.getState().loadRound(makeFlowRound({}));
}

/** The sheet a write lands in: the one the store made active. */
function activeSheetTitle(): string {
    const state = useFlowStore.getState();
    return state.round!.sheets.find((s) => s.id === state.activeSheetId)!.title;
}

beforeEach(() => {
    // The bridge is desktop-only, so every route needs the shell's global.
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    setActiveHot(null, null, null, 0);
    clearReplica();
    resetMetaUndo();
    resetRevealCycle();
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        insertPaste: false,
        revealTarget: null,
        cardmirrorEnabled: true,
        cardmirrorSpaceArguments: false,
    });
});

afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("the flow route", () => {
    it("writes a row per item downward from the active cell", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        grid.select(2, 1);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        const reply = send([block, tag, cite]);

        expect(reply.status).toBe(200);
        expect(reply.body).toMatchObject({ ok: true, written: 2, row: 2, col: 1 });
        expect(grid.data[2][1]).toBe("Cap K");
        expect(grid.data[3][1]).toBe("Perm solves\nSmith 24");
        expect(grid.at(2, 1).className).toBe("flow-bold");
        expect(grid.at(3, 1).className).toBe("flow-card");
        expect(grid.at(3, 1).source).toEqual({
            app: "cardmirror",
            token: "cmsrc1.a",
            key: "doc-1|perm solves",
            title: "AT - Cap K",
        });
    });

    it("leaves the cursor under the send so a second one stacks", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        grid.select(2, 1);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([block, tag]);
        expect(grid.hot.getSelectedLast()).toEqual([4, 1]);
        send([tag]);
        expect(grid.data[4][1]).toBe("Perm solves");
    });

    it("spaces CardMirror arguments when argument spacing is on", () => {
        loadRound();
        useFlowStore.setState({ cardmirrorSpaceArguments: true });
        const grid = makeGrid(10, 3);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        const reply = send([
            tag,
            cite,
            { kind: "analytic", text: "No link" },
            { kind: "tag", text: "Turn case" },
        ]);

        expect(reply.body).toMatchObject({ ok: true, written: 3 });
        expect(grid.data.slice(0, 5).map((row) => row[0])).toEqual([
            "Perm solves\nSmith 24",
            "",
            "No link",
            "",
            "Turn case",
        ]);
        expect(grid.hot.getSelectedLast()).toEqual([5, 0]);
    });

    it("overwrites the column by default", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        grid.data[0][0] = "old";
        grid.data[1][0] = "keep";
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([tag]);
        expect(grid.data[0][0]).toBe("Perm solves");
        expect(grid.data[1][0]).toBe("keep");
    });

    it("pushes the column down when insert paste is on", () => {
        loadRound();
        useFlowStore.setState({ insertPaste: true });
        const grid = makeGrid(10, 3);
        grid.data[0][0] = "old";
        grid.data[1][0] = "older";
        grid.at(0, 0).className = "flow-bold";
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([tag]);
        expect(grid.data[0][0]).toBe("Perm solves");
        expect(grid.data[1][0]).toBe("old");
        expect(grid.data[2][0]).toBe("older");
        expect(grid.at(1, 0).className).toBe("flow-bold");
        expect(grid.at(0, 0).className).toBe("flow-card");
    });

    it("grows an insert paste from a selection below the column tail", () => {
        loadRound();
        useFlowStore.setState({ insertPaste: true, cardmirrorSpaceArguments: true });
        const grid = makeGrid(3, 1);
        grid.select(2, 0);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([tag, { kind: "analytic", text: "No link" }]);

        expect(grid.data).toHaveLength(5);
        expect(grid.data.slice(2).map((row) => row[0])).toEqual(["Perm solves", "", "No link"]);
    });

    it("grows the grid rather than dropping a send off the bottom", () => {
        loadRound();
        const grid = makeGrid(2, 1);
        grid.select(1, 0);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([block, tag, { kind: "analytic", text: "No link" }]);
        expect(grid.data).toHaveLength(4);
        expect(grid.data[3][0]).toBe("No link");
    });

    it("names the sheet it wrote to and reports the cell count", () => {
        loadRound();
        const grid = makeGrid(10, 1);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        expect(send([tag, cite], "cell").body).toMatchObject({
            ok: true,
            written: 1,
            sheet: activeSheetTitle(),
        });
        expect(grid.data[0][0]).toBe("Perm solves\nSmith 24");
    });

    it("answers no-active-sheet with no grid and no-active-cell with no selection", () => {
        expect(send([tag]).body).toEqual({ ok: false, error: "no-active-sheet" });

        loadRound();
        const grid = makeGrid(10, 1);
        setActiveHot({ ...grid.hot, getSelectedLast: () => undefined } as never, vi.fn(), null, 0);
        expect(send([tag]).body).toEqual({ ok: false, error: "no-active-cell" });
    });

    it("rejects a malformed body and an unknown route", () => {
        expect(handleBridgeRequest("flow", { items: [] })).toEqual({
            status: 400,
            body: { ok: false, error: "bad-request" },
        });
        expect(handleBridgeRequest("nonsense", {}).status).toBe(400);
    });

    it("leaves the empty cells below a send and lands the cursor below them", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        grid.select(0, 0);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        const reply = send([block, tag], "column", 2);

        // `written` counts the items, not the rows the empty cells took.
        expect(reply.body).toMatchObject({ ok: true, written: 2 });
        expect(grid.data[0][0]).toBe("Cap K");
        expect(grid.data[1][0]).toBe("Perm solves");
        expect(grid.data[2][0]).toBe("");
        expect(grid.data[3][0]).toBe("");
        expect(grid.hot.getSelectedLast()).toEqual([4, 0]);
    });

    it("overwrites text and decoration below the send when insert paste is off", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        grid.data[1][0] = "old note";
        grid.at(1, 0).className = "flow-highlight";
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([tag], "column", 1);

        expect(grid.data[0][0]).toBe("Perm solves");
        expect(grid.data[1][0]).toBe("");
        expect(grid.at(1, 0).className).toBe("");
    });

    it("keeps the empty cells clear of the tail an insert paste pushes down", () => {
        loadRound();
        useFlowStore.setState({ insertPaste: true });
        const grid = makeGrid(10, 3);
        grid.data[0][0] = "old";
        grid.at(0, 0).className = "flow-bold";
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([tag], "column", 1);

        expect(grid.data[0][0]).toBe("Perm solves");
        expect(grid.data[1][0]).toBe("");
        expect(grid.data[2][0]).toBe("old");
        expect(grid.at(1, 0).className).toBe("");
        expect(grid.at(2, 0).className).toBe("flow-bold");
    });

    it("grows the grid to hold the empty cells", () => {
        loadRound();
        const grid = makeGrid(3, 3);
        grid.select(2, 0);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);

        send([tag], "column", 3);

        expect(grid.data.length).toBeGreaterThanOrEqual(6);
        expect(grid.data[2][0]).toBe("Perm solves");
        expect(grid.data[5][0]).toBe("");
    });
});

/**
 * An aligned pane leads with one inert column per speech the sheet does not
 * show, so the grid column the cursor sits in is not the cell it names. The
 * pane publishes the count and the bridge converts against it; a send that
 * skipped that would put a card on the wire against a partner's speech.
 */
describe("the flow route on a padded pane", () => {
    /** The active flow sheet, with a replica open so the ops are observable. */
    function paddedRound() {
        loadRound();
        const round = useFlowStore.getState().round!;
        const sheetId = useFlowStore.getState().activeSheetId!;
        seedReplica(round);
        return { round, sheetId };
    }

    it("records a send against the sheet's own column, not the grid's", () => {
        const { round, sheetId } = paddedRound();
        const grid = makeGrid(10, 3);
        grid.select(0, 1);
        // One spacer, so grid column 1 is the sheet's first cell.
        setActiveHot(grid.hot as never, vi.fn(), sheetId, 1);

        const reply = send([tag]);

        // Drawn where the cursor is, reported and recorded as the cell it names.
        expect(grid.data[0][1]).toBe("Perm solves");
        expect(reply.body).toMatchObject({ ok: true, col: 0 });
        const sheet = projectDoc(getReplica()!, round).sheets.find((s) => s.id === sheetId)!;
        expect(sheet.data[0][0]).toBe("Perm solves");
        expect(sheet.data[0][1] ?? null).toBeNull();
    });

    it("refuses a send aimed at a spacer, which names no cell of the sheet", () => {
        const { round, sheetId } = paddedRound();
        const grid = makeGrid(10, 3);
        grid.select(0, 0);
        setActiveHot(grid.hot as never, vi.fn(), sheetId, 1);

        expect(send([tag]).body).toMatchObject({ ok: false, error: "no-active-cell" });
        expect(grid.data[0][0]).toBeNull();
        expect(projectDoc(getReplica()!, round).sheets.find((s) => s.id === sheetId)!.data).toEqual(
            [],
        );
    });
});

describe("the reveal route", () => {
    const sourced = (key: string): CellMeta => ({ source: { app: "cardmirror", token: "t", key } });

    /** Two hits on the CX sheet (order -1, so first) and one on the flow sheet. */
    function roundWithHits() {
        const round = makeFlowRound({});
        round.sheets[0].meta = { "3,2": sourced("doc-1|perm"), "1,0": sourced("doc-1|perm") };
        round.sheets[1].meta = { "0,1": sourced("doc-1|smith") };
        useFlowStore.getState().loadRound(round);
        return round;
    }

    const reveal = (keys: string[]) => handleBridgeRequest("reveal", { keys });

    it("counts every match, names the sheets, and selects the first", () => {
        const round = roundWithHits();
        const body = reveal(["doc-1|perm", "doc-1|smith"]).body as Record<string, unknown>;

        expect(body.ok).toBe(true);
        expect(body.matches).toBe(3);
        expect(body.sheets).toEqual([round.sheets[0].title, round.sheets[1].title]);
        expect(body).toMatchObject({ sheet: round.sheets[0].title, row: 1, col: 0 });
        expect(useFlowStore.getState().revealTarget).toMatchObject({
            sheetId: round.sheets[0].id,
            row: 1,
            col: 0,
        });
    });

    it("walks to the next match when the same keys come back", () => {
        roundWithHits();
        const keys = ["doc-1|perm", "doc-1|smith"];
        expect(reveal(keys).body).toMatchObject({ row: 1, col: 0 });
        expect(reveal(keys).body).toMatchObject({ row: 3, col: 2 });
        expect(reveal(keys).body).toMatchObject({ row: 0, col: 1 });
        expect(reveal(keys).body).toMatchObject({ row: 1, col: 0 });
    });

    it("restarts at the first match when a different card asks", () => {
        roundWithHits();
        reveal(["doc-1|perm", "doc-1|smith"]);
        expect(reveal(["doc-1|perm"]).body).toMatchObject({ row: 1, col: 0 });
    });

    it("reports zero matches without selecting anything", () => {
        roundWithHits();
        expect(reveal(["doc-1|absent"]).body).toEqual({ ok: true, matches: 0 });
        expect(useFlowStore.getState().revealTarget).toBeNull();
    });

    it("answers no-round with nothing open and rejects an empty key list", () => {
        expect(reveal(["doc-1|perm"]).body).toEqual({ ok: false, error: "no-round" });
        loadRound();
        expect(handleBridgeRequest("reveal", { keys: [] }).status).toBe(400);
    });
});

describe("the desktop-only gate", () => {
    it("turns every route away when the switch is off, without touching the grid", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);
        useFlowStore.setState({ cardmirrorEnabled: false });

        expect(send([tag]).body).toEqual({ ok: false, error: "integration-disabled" });
        expect(handleBridgeRequest("reveal", { keys: ["doc-1|perm"] }).body).toEqual({
            ok: false,
            error: "integration-disabled",
        });
        expect(grid.data[0][0]).toBeNull();
    });

    it("turns every route away on the web build", () => {
        loadRound();
        const grid = makeGrid(10, 3);
        setActiveHot(grid.hot as never, vi.fn(), null, 0);
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

        expect(send([tag]).body).toEqual({ ok: false, error: "integration-disabled" });
        expect(grid.data[0][0]).toBeNull();
    });
});
