import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, it, expect } from "vitest";

import { makeFlowRound, type FlowRound } from "@/lib/model/flow";

import { cellCompletions, makeCellCompletionSource } from "./cellCompletion";

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
    it("maps matching cells to completions with the column header and side", () => {
        const opts = cellCompletions(roundWithCells(), "prol");
        expect(opts[0].label).toBe("prolif good");
        expect(opts[0].detail).toBe("1AC");
        // 1AC is an aff speech; the type drives the aff/neg icon and ink.
        expect(opts[0].type).toBe("aff");
    });

    it("returns nothing when no cell matches", () => {
        expect(cellCompletions(roundWithCells(), "zzzzz")).toEqual([]);
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
