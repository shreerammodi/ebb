import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { firstLine, flushPushEdits, queuePushEdit, resetPushEdits } from "@/lib/bridge/pushEdits";
import { seedDoc } from "@/lib/collab/doc";
import { applyOp } from "@/lib/collab/ops";
import { clearReplica, seedReplica } from "@/lib/collab/replica";
import { createClock } from "@/lib/collab/stamp";
import { setActiveHot } from "@/lib/grid/hotInstance";
import { makeFlowRound, type CellSource } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { metaStore, type FakeCellMeta } from "../../support/fakeHot";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const invoked = vi.mocked(invoke);
const toasted = vi.mocked(toast);

const SHEET = "sheet-1";

const SOURCE: CellSource = {
    app: "cardmirror",
    token: "cmsrc1.a",
    key: "doc-1|the plan causes inequality",
    title: "AT - Cap K",
};

interface FakeGrid {
    /** The cell's live meta, for asserting what a write-back left behind. */
    at(row: number, col: number): FakeCellMeta;
    /** Puts text in a cell, and provenance on it when given. */
    put(row: number, col: number, text: string | null, source?: CellSource): void;
    /** The snapshot callback the grid registered, which carries meta out. */
    mutated: () => void;
}

/**
 * The slice of Handsontable the push layer touches: a cell's text, its
 * provenance, and the snapshot hook a meta write rings.
 */
function makeGrid(sheetId = SHEET): FakeGrid {
    const meta = metaStore();
    const text = new Map<string, string | null>();
    const mutated = vi.fn();
    let rows = 0;
    const hot = {
        getCellMeta: meta.getCellMeta,
        setCellMeta: meta.setCellMeta,
        getDataAtCell: (row: number, col: number) => text.get(`${row},${col}`) ?? null,
        // The run walk reads it, so it has to grow with what a test puts in:
        // a grid that claimed one row would end every run at the first cell.
        countRows: () => rows,
    };
    setActiveHot(hot as never, mutated, sheetId, 0);
    return {
        at: meta.at,
        put: (row, col, value, source) => {
            text.set(`${row},${col}`, value);
            rows = Math.max(rows, row + 1);
            if (source) meta.setCellMeta(row, col, "source", source);
        },
        mutated,
    };
}

/**
 * Lets the debounce fire and the drain it started finish. The second await
 * joins the request in flight rather than opening another, so a test never
 * asserts against a half-finished push.
 */
async function settle(ms = 600): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    await flushPushEdits();
}

const replaced = () => invoked.mock.calls.filter(([command]) => command === "cardmirror_replace");
const inserted = () =>
    invoked.mock.calls.filter(([command]) => command === "cardmirror_insert_after");

beforeEach(() => {
    vi.useFakeTimers();
    invoked.mockReset();
    toasted.mockReset();
    resetPushEdits();
    clearReplica();
    setActiveHot(null, null, null, 0);
    // The push is desktop-only, so every path needs the shell's global.
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    useFlowStore.setState({ cardmirrorEnabled: true, cardmirrorPushEdits: true });
});

afterEach(() => {
    resetPushEdits();
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("pushing an edit back to the document", () => {
    it("hands CardMirror the cell's token and its new text", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "The plan causes poverty.", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(invoked).toHaveBeenCalledWith("cardmirror_replace", {
            source: "cmsrc1.a",
            text: "The plan causes poverty.",
        });
        // Success is silent: this runs on every settled edit of a linked cell.
        expect(toasted).not.toHaveBeenCalled();
    });

    it("coalesces a burst on one cell into a single push of the latest text", async () => {
        const grid = makeGrid();
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        grid.put(0, 0, "The plan causes", SOURCE);
        queuePushEdit(SHEET, 0, 0);
        await vi.advanceTimersByTimeAsync(100);
        grid.put(0, 0, "The plan causes pov");
        queuePushEdit(SHEET, 0, 0);
        await vi.advanceTimersByTimeAsync(100);
        grid.put(0, 0, "The plan causes poverty.");
        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(replaced()).toHaveLength(1);
        expect(replaced()[0][1]).toEqual({
            source: "cmsrc1.a",
            text: "The plan causes poverty.",
        });
    });

    it("pushes the first line of a tag cell that carries a folded cite", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "Perm solves\nSmith 24", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(replaced()[0][1]).toEqual({ source: "cmsrc1.a", text: "Perm solves" });
    });

    it("does not care that the cite line changed, because the token names line one", () => {
        // The grid asks exactly this before it queues anything, so a rewritten
        // cite never reaches the queue: the document node the cell came from
        // still says what it always said.
        expect(firstLine("Perm solves\nSmith 24")).toBe(firstLine("Perm solves\nJones 25"));
        expect(firstLine("Perm solves")).not.toBe(firstLine("Perm, then CP"));
    });

    it("stops waiting once edits have been arriving for the ceiling", async () => {
        const grid = makeGrid();
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        // Faster than the window, so a debounce that only reset would never
        // fire and the document would sit out the whole speech.
        for (let i = 0; i < 40; i++) {
            grid.put(0, 0, `edit ${i}`, i === 0 ? SOURCE : undefined);
            queuePushEdit(SHEET, 0, 0);
            await vi.advanceTimersByTimeAsync(100);
        }
        await flushPushEdits();

        expect(replaced().length).toBeGreaterThan(0);
    });
});

describe("the token CardMirror mints for the new text", () => {
    it("lands on the cell, so the next edit there has something to anchor on", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "first edit", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(grid.at(0, 0).source?.token).toBe("cmsrc1.b");
        // The write went out through the snapshot path, which is what carries
        // the refreshed token into the store and from there to the file.
        expect(grid.mutated).toHaveBeenCalled();

        grid.put(0, 0, "second edit");
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.c" });
        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(replaced()).toHaveLength(2);
        expect(replaced()[1][1]).toEqual({ source: "cmsrc1.b", text: "second edit" });
    });

    it("leaves the cell's key and title alone: the same card in the same document", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(grid.at(0, 0).source).toEqual({ ...SOURCE, token: "cmsrc1.b" });
    });
});

/** One line of a column: its text, and the token of the document node it came
 *  from - null for a line typed on the flow. */
type Line = readonly [text: string, token: string | null];

/**
 * A column, top to bottom. A send leaves a blank cell under itself, so a run
 * that ends inside the column ends with one.
 */
function column(...lines: readonly Line[]): FakeGrid {
    const grid = makeGrid();
    lines.forEach(([text, token], row) =>
        grid.put(row, 0, text, token ? { ...SOURCE, token } : undefined),
    );
    return grid;
}

const ONE: Line = ["arg one", "cmsrc1.one"];
const TWO: Line = ["arg two", "cmsrc1.two"];
const THREE: Line = ["arg three", "cmsrc1.three"];
const BLANK: Line = ["", null];

describe("a line typed inside a linked run", () => {
    it("goes into the document after the line above it, and the cell adopts its node", async () => {
        // A gap opened under "arg two" and typed into, so "arg three" has
        // already shifted down.
        const grid = column(ONE, TWO, ["arg four", null], THREE, BLANK);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.four" });

        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(inserted()).toHaveLength(1);
        expect(inserted()[0][1]).toEqual({ source: "cmsrc1.two", text: "arg four" });
        expect(replaced()).toHaveLength(0);
        // Linked from here on: it wears the rail, jump reaches it, and its next
        // edit is an ordinary rewrite of the node that now holds it. No key: a
        // key names an item that was sent, and nothing sent this line.
        expect(grid.at(2, 0).source).toEqual({
            app: "cardmirror",
            token: "cmsrc1.four",
            title: "AT - Cap K",
        });
        expect(grid.mutated).toHaveBeenCalled();
        expect(toasted).not.toHaveBeenCalled();

        grid.put(2, 0, "arg four, sharpened");
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.four2" });
        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(replaced()[0][1]).toEqual({ source: "cmsrc1.four", text: "arg four, sharpened" });
    });

    it("walks over another new line to find its address, and the two land in order", async () => {
        column(ONE, TWO, ["arg four", null], ["arg five", null], THREE, BLANK);
        invoked.mockImplementation(async (_command, args) => ({
            ok: true,
            source: `cmsrc1.for-${String((args as Record<string, unknown>).text)}`,
        }));

        queuePushEdit(SHEET, 2, 0);
        queuePushEdit(SHEET, 3, 0);
        await settle();

        // The lower line anchors on the upper one, which is linked by the time
        // its turn comes, so the document reads four then five under two.
        expect(inserted().map((call) => call[1])).toEqual([
            { source: "cmsrc1.two", text: "arg four" },
            { source: "cmsrc1.for-arg four", text: "arg five" },
        ]);
    });

    it("asks the lower line again once the upper one is linked", async () => {
        const grid = column(ONE, TWO, BLANK, ["arg five", null], THREE, BLANK);
        invoked.mockImplementation(async (_command, args) => ({
            ok: true,
            source: `cmsrc1.for-${String((args as Record<string, unknown>).text)}`,
        }));

        // Typed bottom first: the cell above it is still blank, and a blank
        // cell ends the run, so this line is outside one and says nothing.
        queuePushEdit(SHEET, 3, 0);
        await settle();
        expect(inserted()).toHaveLength(0);

        grid.put(2, 0, "arg four");
        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(inserted().map((call) => call[1])).toEqual([
            { source: "cmsrc1.two", text: "arg four" },
            { source: "cmsrc1.for-arg four", text: "arg five" },
        ]);
        expect(grid.at(3, 0).source?.token).toBe("cmsrc1.for-arg five");
    });

    it("keeps its provenance off a cell whose text moved on while the reply was out", async () => {
        const grid = column(ONE, TWO, ["arg four", null], THREE, BLANK);
        invoked.mockImplementation(async () => {
            grid.put(2, 0, "something else entirely");
            return { ok: true, source: "cmsrc1.four" };
        });

        queuePushEdit(SHEET, 2, 0);
        await settle();

        // The node holds the line that went out, and this cell no longer says
        // it: a source here would claim a node that holds something else.
        expect(grid.at(2, 0).source).toBeUndefined();
    });

    it("says nothing when the push is refused, and does not link the cell", async () => {
        const grid = column(ONE, TWO, ["arg four", null], THREE, BLANK);
        invoked.mockResolvedValue({ ok: false, error: "body-text" });

        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(grid.at(2, 0).source).toBeUndefined();
        expect(toasted).toHaveBeenCalledWith(
            "CardMirror could not take that edit, so it stayed in your flow.",
        );
    });

    it("retries a refusal that named a reason, because nothing was written", async () => {
        const grid = column(ONE, TWO, ["arg four", null], THREE, BLANK);
        invoked.mockResolvedValue({ ok: false, error: "doc-readonly" });
        queuePushEdit(SHEET, 2, 0);
        await settle();

        grid.put(2, 0, "arg four, sharpened");
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.four" });
        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(inserted()).toHaveLength(2);
        expect(grid.at(2, 0).source?.token).toBe("cmsrc1.four");
    });

    /**
     * Each answer that leaves ebb unable to say whether the node was written.
     * Asking again would put a second copy of the line in the debater's file,
     * which is worse than the line staying in the flow.
     */
    const UNSETTLED: readonly [name: string, answer: () => void][] = [
        ["a peer that stopped answering", () => invoked.mockRejectedValue("timeout")],
        ["an answer ebb could not read", () => invoked.mockRejectedValue("nonsense")],
        [
            "a node written with no token minted",
            () => invoked.mockResolvedValue({ ok: false, error: "internal" }),
        ],
        [
            "a request held behind the consent prompt",
            () => invoked.mockResolvedValue({ ok: true, pending: "consent" }),
        ],
    ];

    it.each(UNSETTLED)("never asks for the same line twice after %s", async (_name, answer) => {
        const grid = column(ONE, TWO, ["arg four", null], THREE, BLANK);
        answer();
        queuePushEdit(SHEET, 2, 0);
        await settle();
        expect(inserted()).toHaveLength(1);

        // The same line, asked for again by an edit that settled on it.
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.four" });
        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(inserted()).toHaveLength(1);
        expect(grid.at(2, 0).source).toBeUndefined();

        // A different line at the same address is a different line: the hold is
        // on what was asked for, not on the cell.
        grid.put(2, 0, "arg five");
        queuePushEdit(SHEET, 2, 0);
        await settle();

        expect(inserted()).toHaveLength(2);
        expect(inserted()[1][1]).toEqual({ source: "cmsrc1.two", text: "arg five" });
    });

    it("says a line whose fate it does not know is not going again", async () => {
        column(ONE, TWO, ["arg four", null], THREE, BLANK);
        invoked.mockRejectedValue("timeout");

        queuePushEdit(SHEET, 2, 0);
        await settle();

        // Not the ordinary line, which promises the text stayed in the flow: a
        // node CardMirror may have written is not a promise ebb can make.
        expect(toasted).toHaveBeenCalledTimes(1);
        expect(toasted).toHaveBeenCalledWith(
            "CardMirror did not say where that new line went, so ebb will not send it again.",
        );
    });

    it("still retries a rewrite after a timeout: the same text lands once", async () => {
        const grid = column(ONE, TWO, THREE, BLANK);
        invoked.mockRejectedValue("timeout");
        grid.put(1, 0, "arg two, sharpened");
        queuePushEdit(SHEET, 1, 0);
        await settle();

        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.two2" });
        queuePushEdit(SHEET, 1, 0);
        await settle();

        expect(replaced()).toHaveLength(2);
        expect(grid.at(1, 0).source?.token).toBe("cmsrc1.two2");
    });
});

describe("a new line the run does not close over", () => {
    it("stays in the flow under the last line of a send", async () => {
        column(ONE, TWO, THREE, ["my own analytic", null]);

        queuePushEdit(SHEET, 3, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("stays in the flow above the first line of a send", async () => {
        column(["my own analytic", null], ONE, TWO, BLANK);

        queuePushEdit(SHEET, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("stays in the flow when a blank cell separates it from the run", async () => {
        // Two sends with a gap between them: the line under the gap is the
        // debater's own, and the next send's first line is not its run.
        column(ONE, TWO, THREE, BLANK, ["my own analytic", null], ["arg four", "cmsrc1.four"]);

        queuePushEdit(SHEET, 4, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("refuses a run whose linked cell above is a partner's", async () => {
        const round = makeFlowRound({});
        const flow = round.sheets.find((s) => s.kind !== "cx")!;
        flow.data = [["arg one"], ["arg two"], ["arg three"]];
        const theirs = applyOp(
            seedDoc(round),
            {
                kind: "cellMeta",
                sheetId: flow.id,
                col: 0,
                row: 0,
                meta: { source: { ...SOURCE, token: "theirs" } },
            },
            { actor: "them", clock: createClock("them", () => 9_000) },
        );
        seedReplica(round, "me", theirs);
        const grid = makeGrid(flow.id);
        grid.put(0, 0, "arg one", { ...SOURCE, token: "theirs" });
        grid.put(1, 0, "arg two typed here");
        grid.put(2, 0, "arg three", { ...SOURCE, token: "cmsrc1.three" });

        queuePushEdit(flow.id, 1, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });
});

/** Each way the feature is switched off, all of which have to be dead. */
const OFF_CASES: readonly [name: string, off: () => void][] = [
    [
        "the web build",
        () => {
            delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
        },
    ],
    ["the integration switched off", () => useFlowStore.setState({ cardmirrorEnabled: false })],
    ["the push setting off", () => useFlowStore.setState({ cardmirrorPushEdits: false })],
];

describe("everything that switches the push off", () => {
    it.each(OFF_CASES)("is dead under %s: no timer, no request", async (_name, off) => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        off();

        queuePushEdit(SHEET, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle(3_000);
        expect(invoked).not.toHaveBeenCalled();
    });

    it("says nothing about a cell that was typed here", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "typed on the flow");

        queuePushEdit(SHEET, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("never pushes an empty first line, because ebb does not cut the document", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "   \nSmith 24", SOURCE);

        queuePushEdit(SHEET, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("refuses a token a partner minted, which names a document only they hold", async () => {
        const round = makeFlowRound({});
        const flow = round.sheets.find((s) => s.kind !== "cx")!;
        flow.data = [["The plan causes inequality."]];
        const theirs = applyOp(
            seedDoc(round),
            {
                kind: "cellMeta",
                sheetId: flow.id,
                col: 0,
                row: 0,
                meta: { source: { ...SOURCE, token: "theirs" } },
            },
            { actor: "them", clock: createClock("them", () => 9_000) },
        );
        seedReplica(round, "me", theirs);
        const grid = makeGrid(flow.id);
        grid.put(0, 0, "edited here", { ...SOURCE, token: "theirs" });

        queuePushEdit(flow.id, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });
});

describe("a push CardMirror would not take", () => {
    it("says a reason once per session and swallows every repeat of it", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "first", SOURCE);
        invoked.mockResolvedValue({ ok: false, error: "not-found" });

        queuePushEdit(SHEET, 0, 0);
        await settle();
        grid.put(0, 0, "second");
        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(replaced()).toHaveLength(2);
        expect(toasted).toHaveBeenCalledTimes(1);
        expect(toasted).toHaveBeenCalledWith(
            "ebb could not find that card in the document, so your edit stayed in your flow.",
        );
    });

    it("gives a second, different reason its own say", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "first", SOURCE);
        invoked.mockResolvedValue({ ok: false, error: "not-found" });
        queuePushEdit(SHEET, 0, 0);
        await settle();

        grid.put(0, 0, "second");
        invoked.mockResolvedValue({ ok: false, error: "doc-readonly" });
        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(toasted).toHaveBeenCalledTimes(2);
        expect(toasted).toHaveBeenLastCalledWith(
            "That CardMirror document is in read mode, so your edit stayed in your flow.",
        );
    });

    it("names the document to open when it is closed", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        invoked.mockResolvedValue({ ok: false, error: "doc-not-open", docTitle: "AT - Cap K" });

        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(toasted).toHaveBeenCalledWith(
            'Open "AT - Cap K" in CardMirror to receive your edits.',
        );
    });

    it("reports a CardMirror that is not running, and stops reporting it", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        invoked.mockRejectedValue("not-running");

        queuePushEdit(SHEET, 0, 0);
        await settle();
        grid.put(0, 0, "edited again");
        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(toasted).toHaveBeenCalledTimes(1);
        expect(toasted).toHaveBeenCalledWith(
            "CardMirror is not running. Your edits are staying in your flow.",
        );
    });

    it("uses the consent wording the other commands use", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        invoked.mockResolvedValue({ ok: false, error: "not-allowed" });

        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(toasted).toHaveBeenCalledWith(
            "CardMirror is blocking ebb. Allow it under External apps in its settings.",
        );
    });

    it("leaves the old token in place behind a consent prompt", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        // A queued route answers ok with nothing done, and the token it mints
        // on the replay never comes back here, so writing anything would be a
        // guess at provenance.
        invoked.mockResolvedValue({ ok: true, pending: "consent", source: "cmsrc1.b" });

        queuePushEdit(SHEET, 0, 0);
        await settle();
        grid.put(0, 0, "edited again");
        queuePushEdit(SHEET, 0, 0);
        await settle();

        expect(grid.at(0, 0).source?.token).toBe("cmsrc1.a");
        expect(toasted).toHaveBeenCalledTimes(1);
        expect(toasted).toHaveBeenCalledWith(
            "Waiting for approval in CardMirror. Your edit lands there when you allow ebb.",
        );
    });
});

describe("flushing on the way out", () => {
    it("resolves against an empty queue without asking CardMirror anything", async () => {
        makeGrid();
        await flushPushEdits();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("drains what is queued without waiting out the window", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "typed as the window closed", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queuePushEdit(SHEET, 0, 0);
        await flushPushEdits();

        expect(replaced()).toHaveLength(1);
        // The pending timer went with the flush, so nothing fires afterwards.
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(600);
        expect(replaced()).toHaveLength(1);
    });

    it("drains every queued cell, one request at a time", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "first cell", SOURCE);
        grid.put(1, 0, "second cell", { ...SOURCE, token: "cmsrc1.z" });
        // Recorded rather than asserted inside the mock: a throw in there is
        // caught by the transport and read as a malformed answer, so the
        // assertion would vanish.
        const order: string[] = [];
        invoked.mockImplementation(async (_command, args) => {
            const text = String((args as Record<string, unknown>).text);
            order.push(`start ${text}`);
            await Promise.resolve();
            order.push(`end ${text}`);
            return { ok: true, source: "cmsrc1.fresh" };
        });

        queuePushEdit(SHEET, 0, 0);
        queuePushEdit(SHEET, 1, 0);
        await flushPushEdits();

        expect(order).toEqual([
            "start first cell",
            "end first cell",
            "start second cell",
            "end second cell",
        ]);
        expect(replaced().map((call) => call[1])).toEqual([
            { source: "cmsrc1.a", text: "first cell" },
            { source: "cmsrc1.z", text: "second cell" },
        ]);
    });
});
