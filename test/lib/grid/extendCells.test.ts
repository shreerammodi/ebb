import { describe, expect, it } from "vitest";

import { BOLD_CLASS, GROUP_CLASS, HIGHLIGHT_CLASS, KICKED_CLASS } from "@/lib/grid/codec";
import { gridCol } from "@/lib/grid/colSpace";
import { extendRun, extensionRequiredRows, nextSameSideColumn } from "@/lib/grid/extendCells";
import type { SpeechCol } from "@/lib/grid/flowColumns";

import { fakeGrid } from "../../support/fakeHot";

const columns: SpeechCol[] = [
    { id: "1ac", name: "1AC", short: "1AC", side: "aff" },
    { id: "1nc", name: "1NC", short: "1NC", side: "neg" },
    { id: "2ac", name: "2AC", short: "2AC", side: "aff" },
    { id: "2nc", name: "2NC", short: "2NC", side: "neg" },
];

const source = { app: "cardmirror", token: "token-1", key: "doc|card" };

describe("nextSameSideColumn", () => {
    it("skips the intervening opponent speech", () => {
        expect(nextSameSideColumn(columns, 0)).toBe(2);
        expect(nextSameSideColumn(columns, 1)).toBe(3);
    });

    it("returns null for the side's last speech and an overflow column", () => {
        expect(nextSameSideColumn(columns, 2)).toBeNull();
        expect(nextSameSideColumn(columns, 8)).toBeNull();
    });
});

describe("extendRun", () => {
    it("copies the exact run and moves only the destination tail", () => {
        const grid = fakeGrid(
            [
                ["tag", "neg-a", "dest-a", "neg-b"],
                [null, "neg-c", "dest-b", "neg-d"],
                ["warrant", null, "dest-c", null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
            ],
            {
                "0,0": `${BOLD_CLASS} ${KICKED_CLASS}`,
                "1,0": GROUP_CLASS,
                "2,0": HIGHLIGHT_CLASS,
                "1,2": BOLD_CLASS,
            },
            { "0,0": source },
        );

        const changes = extendRun(grid, {
            sourceCol: gridCol(0),
            targetCol: gridCol(2),
            startRow: 0,
            height: 3,
        });
        grid.setDataAtCell(changes);

        expect(grid.col(0)).toEqual(["tag", null, "warrant", null, null, null]);
        expect(grid.col(1)).toEqual(["neg-a", "neg-c", null, null, null, null]);
        expect(grid.col(2)).toEqual(["tag", null, "warrant", "dest-a", "dest-b", "dest-c"]);
        expect(grid.col(3)).toEqual(["neg-b", "neg-d", null, null, null, null]);
        expect(grid.classNames["0,0"]).toBe(`${BOLD_CLASS} ${KICKED_CLASS}`);
        expect(grid.classNames["0,2"]).toBe(BOLD_CLASS);
        expect(grid.classNames["1,2"]).toBe(GROUP_CLASS);
        expect(grid.classNames["2,2"]).toBe(HIGHLIGHT_CLASS);
        expect(grid.sources["0,0"]).toEqual(source);
        expect(grid.sources["0,2"]).toEqual(source);
    });

    it("reports capacity that preserves an occupied destination tail", () => {
        const grid = fakeGrid([
            ["source", null, "a"],
            [null, null, "b"],
            [null, null, "c"],
        ]);

        expect(extensionRequiredRows(grid, gridCol(2), 0, 2)).toBe(5);
    });

    it("preserves destination metadata below its last text when capacity is available", () => {
        const grid = fakeGrid(
            [
                ["tag", null, "dest"],
                ["warrant", null, null],
                [null, null, null],
                [null, null, null],
                [null, null, null],
                [null, null, null],
                [null, null, null],
            ],
            { "4,2": HIGHLIGHT_CLASS },
            { "4,2": source },
        );

        expect(extensionRequiredRows(grid, gridCol(2), 0, 2)).toBe(7);
        grid.setDataAtCell(
            extendRun(grid, {
                sourceCol: gridCol(0),
                targetCol: gridCol(2),
                startRow: 0,
                height: 2,
            }),
        );

        expect(grid.col(2)).toEqual(["tag", "warrant", "dest", null, null, null, null]);
        expect(grid.classNames["6,2"]).toBe(HIGHLIGHT_CLASS);
        expect(grid.sources["6,2"]).toEqual(source);
    });
});
