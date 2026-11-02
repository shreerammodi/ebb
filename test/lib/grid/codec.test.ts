import { describe, expect, it } from "vitest";

import {
    BOLD_CLASS,
    CARD_CLASS,
    EXTENDED_CLASS,
    classNameToMeta,
    gridWidth,
    GROUP_CLASS,
    HIGHLIGHT_CLASS,
    KICKED_CLASS,
    MAX_GRID_WIDTH,
    metaToClassName,
    padGrid,
    toggleClassToken,
    trimGrid,
} from "@/lib/grid/codec";

describe("meta <-> className", () => {
    it("round-trips bold and highlight", () => {
        expect(metaToClassName({ bold: true })).toBe(BOLD_CLASS);
        expect(metaToClassName({ bold: true, highlight: true })).toBe(
            `${BOLD_CLASS} ${HIGHLIGHT_CLASS}`,
        );
        expect(metaToClassName(undefined)).toBe("");
        expect(classNameToMeta(`${BOLD_CLASS} ${HIGHLIGHT_CLASS}`)).toEqual({
            bold: true,
            highlight: true,
        });
        expect(classNameToMeta("current area")).toBeUndefined();
        expect(classNameToMeta(`current ${HIGHLIGHT_CLASS}`)).toEqual({ highlight: true });
    });

    it("round-trips the card tag, alone and combined", () => {
        expect(metaToClassName({ card: true })).toBe(CARD_CLASS);
        expect(metaToClassName({ bold: true, highlight: true, card: true })).toBe(
            `${BOLD_CLASS} ${HIGHLIGHT_CLASS} ${CARD_CLASS}`,
        );
        expect(classNameToMeta(CARD_CLASS)).toEqual({ card: true });
        expect(classNameToMeta(`${BOLD_CLASS} ${CARD_CLASS}`)).toEqual({ bold: true, card: true });
    });

    it("round-trips the group tag, alone and combined", () => {
        expect(metaToClassName({ group: true })).toBe(GROUP_CLASS);
        expect(metaToClassName({ card: true, group: true })).toBe(`${CARD_CLASS} ${GROUP_CLASS}`);
        expect(classNameToMeta(GROUP_CLASS)).toEqual({ group: true });
        expect(classNameToMeta(`${BOLD_CLASS} ${GROUP_CLASS}`)).toEqual({
            bold: true,
            group: true,
        });
    });

    it("round-trips the kicked tag, alone and beside a highlight", () => {
        expect(metaToClassName({ kicked: true })).toBe(KICKED_CLASS);
        expect(metaToClassName({ highlight: true, kicked: true })).toBe(
            `${HIGHLIGHT_CLASS} ${KICKED_CLASS}`,
        );
        expect(classNameToMeta(KICKED_CLASS)).toEqual({ kicked: true });
        expect(classNameToMeta(`${HIGHLIGHT_CLASS} ${KICKED_CLASS}`)).toEqual({
            highlight: true,
            kicked: true,
        });
    });

    it("round-trips the extended tag", () => {
        expect(metaToClassName({ bold: true, extended: true })).toBe(
            `${BOLD_CLASS} ${EXTENDED_CLASS}`,
        );
        expect(classNameToMeta(EXTENDED_CLASS)).toEqual({ extended: true });
    });

    it("toggleClassToken adds and removes without disturbing other tokens", () => {
        expect(toggleClassToken("", BOLD_CLASS)).toBe(BOLD_CLASS);
        expect(toggleClassToken(`current ${BOLD_CLASS}`, BOLD_CLASS)).toBe("current");
        expect(toggleClassToken(BOLD_CLASS, HIGHLIGHT_CLASS)).toBe(
            `${BOLD_CLASS} ${HIGHLIGHT_CLASS}`,
        );
    });
});

describe("trimGrid / padGrid", () => {
    it("trims trailing empty rows only", () => {
        expect(
            trimGrid([
                [null, "a"],
                ["", null],
                [null, null],
            ]),
        ).toEqual([[null, "a"]]);
        expect(trimGrid([[null]])).toEqual([]);
    });

    it("pads to the column count and minimum row count with fresh arrays", () => {
        const src = [["a"]];
        const out = padGrid(src, 3, 2);
        expect(out).toEqual([
            ["a", null, null],
            [null, null, null],
        ]);
        expect(out[0]).not.toBe(src[0]);
        expect(padGrid([["a", "b", "c"]], 2, 1)).toEqual([["a", "b"]]);
    });

    it("prepends empty columns without disturbing the stored ones", () => {
        const data = [
            ["a", "b"],
            ["c", "d"],
        ];
        expect(padGrid(data, 2, 2, 1)).toEqual([
            [null, "a", "b"],
            [null, "c", "d"],
        ]);
        expect(padGrid(data, 2, 2, 0)).toEqual(data);
    });
});

describe("gridWidth", () => {
    it("takes the wider of the derived columns and the stored rows", () => {
        expect(gridWidth([1, 2, 3], [["a"]])).toBe(3);
        expect(gridWidth([1], [["a", "b", "c", "d"]])).toBe(4);
    });

    it("bounds a claimed width, because the grid materializes rows times width", () => {
        // The two dimensions are independent and both come from the file: one
        // very wide row beside many single-cell rows is a product no machine
        // can allocate, from a file well under a megabyte.
        const hostile = [
            Array.from({ length: 10_000 }, () => ""),
            ...Array.from({ length: 300 }, () => [""]),
        ];

        const width = gridWidth([8], hostile);
        expect(width).toBe(MAX_GRID_WIDTH);

        const padded = padGrid(hostile, width, 250);
        expect(padded).toHaveLength(hostile.length);
        expect(padded[0]).toHaveLength(MAX_GRID_WIDTH);
    });
});
