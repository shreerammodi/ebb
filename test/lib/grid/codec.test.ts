import { describe, expect, it } from "vitest";

import {
    BOLD_CLASS,
    CARD_CLASS,
    classNameToMeta,
    GROUP_CLASS,
    HIGHLIGHT_CLASS,
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
});
