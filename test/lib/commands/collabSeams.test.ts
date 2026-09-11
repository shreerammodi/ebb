/**
 * Collab seams: the commands write through the live grid, then report to the
 * replica from the store's snapshot. `selectionHot` stands in for the grid; the
 * store and the replica are the real ones.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectDoc } from "@/lib/collab/doc";
import { clearReplica, getReplica, recordOp } from "@/lib/collab/replica";
import { executeCommand } from "@/lib/commands/commands";
import {
    BOLD_CLASS,
    classNameToMeta,
    KICKED_CLASS,
    trimGrid,
} from "@/lib/grid/codec";
import { setActiveHot } from "@/lib/grid/hotInstance";
import {
    makeFlowRound,
    type CellMeta,
    type CellSource,
    type FlowRound,
} from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { metaStore, selectionHot } from "../../support/fakeHot";

let round: FlowRound;
let sheetId: string;

function openRound(): void {
    round = makeFlowRound({});
    const flow = round.sheets.find((s) => s.kind !== "cx")!;
    sheetId = flow.id;
    flow.data = [
        ["perm", "link"],
        ["cap bad", "turn"],
        ["extend", null],
    ];
    useFlowStore.getState().loadRound(round);
}

beforeEach(() => {
    clearReplica();
    setActiveHot(null, null, null, 0);
    useFlowStore.setState({ round: null, activeSheetId: null, splitSheetId: null });
});

describe("a decoration toggle reaches the replica", () => {
    it("records the meta of every cell it flipped", () => {
        openRound();
        const grid = selectionHot(1);
        // The store is the source the op reads, so it carries the new class.
        const mutated = () => {
            useFlowStore
                .getState()
                .updateSheetData(sheetId, round.sheets.find((s) => s.id === sheetId)!.data, {
                    "0,0": { bold: true },
                    "1,0": { bold: true },
                });
        };
        setActiveHot(grid as never, mutated, sheetId, 0);

        executeCommand("format.toggleBold");

        const sheet = projectDoc(getReplica()!, round).sheets.find((s) => s.id === sheetId)!;
        expect(sheet.meta["0,0"]).toEqual({ bold: true });
        expect(sheet.meta["1,0"]).toEqual({ bold: true });
    });

    it("records nothing when no grid names a sheet", () => {
        openRound();
        setActiveHot(selectionHot(1) as never, vi.fn(), null, 0);
        const before = getReplica();
        executeCommand("format.toggleBold");
        expect(getReplica()).toBe(before);
    });
});

describe("a cell insert reaches the replica as one shift", () => {
    it("opens a rank in its own column and leaves the neighbour alone", () => {
        openRound();
        const data = [
            ["perm", "link"],
            ["cap bad", "turn"],
            ["extend", null],
        ];
        const grid = {
            getSelectedLast: () => [1, 0, 1, 0],
            countRows: () => data.length,
            countCols: () => 2,
            getDataAtCell: (r: number, c: number) => data[r]?.[c] ?? null,
            getCellMeta: () => ({}),
            setCellMeta: vi.fn(),
            setDataAtCell: vi.fn(),
            render: vi.fn(),
        };
        setActiveHot(grid as never, vi.fn(), sheetId, 0);

        executeCommand("cell.insert");

        const sheet = projectDoc(getReplica()!, round).sheets.find((s) => s.id === sheetId)!;
        // One blank opened at row 1 of column 0; column 1 never moved.
        expect(sheet.data.map((r) => r[0])).toEqual(["perm", null, "cap bad", "extend"]);
        expect(sheet.data.map((r) => r[1])).toEqual(["link", "turn", null, null]);
    });
});

describe("an argument extension reaches the replica as one column insertion", () => {
    it("projects the copy with metadata and leaves adjacent columns fixed", () => {
        const source: CellSource = {
            app: "cardmirror",
            token: "cmsrc1abc",
            key: "doc1|perm",
            title: "AT - Cap K",
        };
        round = makeFlowRound();
        const flow = round.sheets.find((candidate) => candidate.kind !== "cx")!;
        sheetId = flow.id;
        flow.data = [
            ["perm", "link"],
            ["cap bad", "turn"],
            ["extend", null],
        ];
        flow.meta = { "0,0": { bold: true, kicked: true, source } };
        useFlowStore.getState().loadRound(round);
        // One trailing blank destination cell is a real rank that the extension
        // pushes below the three copied cells.
        recordOp({ kind: "cellText", sheetId, col: 2, row: 0, text: null });

        const data = [
            ["perm", "link", null],
            ["cap bad", "turn", null],
            ["extend", null, null],
            [null, null, null],
        ];
        const meta = metaStore([
            ["0,0", { className: `${BOLD_CLASS} ${KICKED_CLASS}`, source }],
        ]);
        const range = {
            getTopLeftCorner: () => ({ row: 0, col: 0 }),
            getBottomRightCorner: () => ({ row: 2, col: 0 }),
        };
        const grid = {
            getSelectedRange: () => [range],
            countRows: () => data.length,
            countCols: () => data[0].length,
            getDataAtCell: (row: number, col: number) => data[row]?.[col] ?? null,
            getCellMeta: meta.getCellMeta,
            setCellMeta: meta.setCellMeta,
            alter: vi.fn(),
            setDataAtCell: vi.fn((changes: [number, number, string | null][]) => {
                for (const [row, col, value] of changes) data[row][col] = value;
            }),
            selectCells: vi.fn(),
            render: vi.fn(),
        };
        const snapshot = () => {
            const storedMeta: Record<string, CellMeta> = {};
            for (let row = 0; row < data.length; row++) {
                for (let col = 0; col < data[row].length; col++) {
                    const runtime = meta.at(row, col);
                    const flags = classNameToMeta(runtime.className ?? "");
                    const provenance =
                        data[row][col] == null || data[row][col] === ""
                            ? undefined
                            : runtime.source;
                    if (provenance) {
                        storedMeta[`${row},${col}`] = { ...(flags ?? {}), source: provenance };
                    } else if (flags) {
                        storedMeta[`${row},${col}`] = flags;
                    }
                }
            }
            useFlowStore
                .getState()
                .updateSheetData(
                    sheetId,
                    trimGrid(data.map((row) => [...row])),
                    storedMeta,
                );
        };
        setActiveHot(grid as never, snapshot, sheetId, 0);

        executeCommand("cell.extend");

        const projected = projectDoc(getReplica()!, round).sheets.find(
            (candidate) => candidate.id === sheetId,
        )!;
        expect(projected.data.map((row) => row[2])).toEqual(["perm", "cap bad", "extend", null]);
        expect(projected.data.map((row) => row[0])).toEqual(["perm", "cap bad", "extend", null]);
        expect(projected.data.map((row) => row[1])).toEqual(["link", "turn", null, null]);
        expect(projected.meta["0,2"]).toEqual({ bold: true, source });
    });
});
