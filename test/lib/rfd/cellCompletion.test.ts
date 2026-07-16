import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, it, expect } from "vitest";

import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import {
    cellCompletions,
    makeCellCompletionSource,
    quoteContinuation,
} from "@/lib/rfd/cellCompletion";

/** Aff round whose first flow sheet has a filled 1AC and 1NC cell. */
function roundWithCells(): FlowRound {
    const round = makeFlowRound("aff");
    const sheet = round.sheets.find((s) => s.kind !== "cx")!;
    // col 0 renders under "1AC", col 1 under "1NC" for an aff sheet.
    sheet.data = [["prolif good", "topicality"]];
    return round;
}

function contextAt(doc: string, pos: number, explicit = false): CompletionContext {
    return new CompletionContext(EditorState.create({ doc }), pos, explicit);
}

describe("cellCompletions", () => {
    it("maps every filled cell to a completion labelled by text, typed by side", () => {
        const opts = cellCompletions(roundWithCells());
        const aff = opts.find((o) => o.label === "prolif good")!;
        const neg = opts.find((o) => o.label === "topicality")!;
        // 1AC is aff, 1NC is neg; type drives the dot and text ink.
        expect(aff.type).toBe("aff");
        expect(neg.type).toBe("neg");
    });

    it("returns nothing when the round has no filled cells", () => {
        const round = makeFlowRound("aff");
        expect(cellCompletions(round)).toEqual([]);
    });
});

describe("quoteContinuation", () => {
    it("re-prefixes continuation lines with the accept line's blockquote marker", () => {
        expect(quoteContinuation("shaped by play\nzagorin 9", "> ")).toBe(
            "shaped by play\n> zagorin 9",
        );
    });

    it("carries leading indentation of a nested quote onto continuation lines", () => {
        expect(quoteContinuation("a\nb", "  > ")).toBe("a\n  > b");
    });

    it("leaves the text verbatim when the accept line is not a blockquote", () => {
        expect(quoteContinuation("a\nb", "the 2nr said ")).toBe("a\nb");
    });
});

describe("makeCellCompletionSource", () => {
    it("fires on a blockquote line, replacing the text after the '>' marker", () => {
        const source = makeCellCompletionSource(() => roundWithCells());
        const doc = "> prol";
        const res = source(contextAt(doc, doc.length));
        expect(res).not.toBeNull();
        expect(res!.from).toBe(2); // right after "> "
        expect(res!.options.map((o) => o.label)).toContain("prolif good");
    });

    it("does not fire on an ordinary prose line unless explicitly invoked", () => {
        const source = makeCellCompletionSource(() => roundWithCells());
        const doc = "the 2nr dropped prol";
        expect(source(contextAt(doc, doc.length))).toBeNull();
    });

    it("fires on a prose line when explicitly invoked, matching the current word", () => {
        const source = makeCellCompletionSource(() => roundWithCells());
        const doc = "prol";
        const res = source(contextAt(doc, doc.length, true));
        expect(res).not.toBeNull();
        expect(res!.from).toBe(0);
        expect(res!.options.map((o) => o.label)).toContain("prolif good");
    });

    it("returns null when there is no round", () => {
        const source = makeCellCompletionSource(() => null);
        const doc = "> prol";
        expect(source(contextAt(doc, doc.length))).toBeNull();
    });
});
