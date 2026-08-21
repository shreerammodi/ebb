import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    firstLine,
    flushSourcedEdits,
    queueSourcedEdit,
    resetPushEdits,
} from "@/lib/bridge/pushEdits";
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
    const hot = {
        getCellMeta: meta.getCellMeta,
        setCellMeta: meta.setCellMeta,
        getDataAtCell: (row: number, col: number) => text.get(`${row},${col}`) ?? null,
    };
    setActiveHot(hot as never, mutated, sheetId, 0);
    return {
        at: meta.at,
        put: (row, col, value, source) => {
            text.set(`${row},${col}`, value);
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
    await flushSourcedEdits();
}

const replaced = () => invoked.mock.calls.filter(([command]) => command === "cardmirror_replace");

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

        queueSourcedEdit(SHEET, 0, 0);
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
        queueSourcedEdit(SHEET, 0, 0);
        await vi.advanceTimersByTimeAsync(100);
        grid.put(0, 0, "The plan causes pov");
        queueSourcedEdit(SHEET, 0, 0);
        await vi.advanceTimersByTimeAsync(100);
        grid.put(0, 0, "The plan causes poverty.");
        queueSourcedEdit(SHEET, 0, 0);
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

        queueSourcedEdit(SHEET, 0, 0);
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
            queueSourcedEdit(SHEET, 0, 0);
            await vi.advanceTimersByTimeAsync(100);
        }
        await flushSourcedEdits();

        expect(replaced().length).toBeGreaterThan(0);
    });
});

describe("the token CardMirror mints for the new text", () => {
    it("lands on the cell, so the next edit there has something to anchor on", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "first edit", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queueSourcedEdit(SHEET, 0, 0);
        await settle();

        expect(grid.at(0, 0).source?.token).toBe("cmsrc1.b");
        // The write went out through the snapshot path, which is what carries
        // the refreshed token into the store and from there to the file.
        expect(grid.mutated).toHaveBeenCalled();

        grid.put(0, 0, "second edit");
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.c" });
        queueSourcedEdit(SHEET, 0, 0);
        await settle();

        expect(replaced()).toHaveLength(2);
        expect(replaced()[1][1]).toEqual({ source: "cmsrc1.b", text: "second edit" });
    });

    it("leaves the cell's key and title alone: the same card in the same document", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queueSourcedEdit(SHEET, 0, 0);
        await settle();

        expect(grid.at(0, 0).source).toEqual({ ...SOURCE, token: "cmsrc1.b" });
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

        queueSourcedEdit(SHEET, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle(3_000);
        expect(invoked).not.toHaveBeenCalled();
    });

    it("says nothing about a cell that was typed here", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "typed on the flow");

        queueSourcedEdit(SHEET, 0, 0);

        expect(vi.getTimerCount()).toBe(0);
        await settle();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("never pushes an empty first line, because ebb does not cut the document", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "   \nSmith 24", SOURCE);

        queueSourcedEdit(SHEET, 0, 0);

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

        queueSourcedEdit(flow.id, 0, 0);

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

        queueSourcedEdit(SHEET, 0, 0);
        await settle();
        grid.put(0, 0, "second");
        queueSourcedEdit(SHEET, 0, 0);
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
        queueSourcedEdit(SHEET, 0, 0);
        await settle();

        grid.put(0, 0, "second");
        invoked.mockResolvedValue({ ok: false, error: "doc-readonly" });
        queueSourcedEdit(SHEET, 0, 0);
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

        queueSourcedEdit(SHEET, 0, 0);
        await settle();

        expect(toasted).toHaveBeenCalledWith(
            'Open "AT - Cap K" in CardMirror to receive your edits.',
        );
    });

    it("reports a CardMirror that is not running, and stops reporting it", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "edited", SOURCE);
        invoked.mockRejectedValue("not-running");

        queueSourcedEdit(SHEET, 0, 0);
        await settle();
        grid.put(0, 0, "edited again");
        queueSourcedEdit(SHEET, 0, 0);
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

        queueSourcedEdit(SHEET, 0, 0);
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

        queueSourcedEdit(SHEET, 0, 0);
        await settle();
        grid.put(0, 0, "edited again");
        queueSourcedEdit(SHEET, 0, 0);
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
        await flushSourcedEdits();
        expect(invoked).not.toHaveBeenCalled();
    });

    it("drains what is queued without waiting out the window", async () => {
        const grid = makeGrid();
        grid.put(0, 0, "typed as the window closed", SOURCE);
        invoked.mockResolvedValue({ ok: true, source: "cmsrc1.b" });

        queueSourcedEdit(SHEET, 0, 0);
        await flushSourcedEdits();

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

        queueSourcedEdit(SHEET, 0, 0);
        queueSourcedEdit(SHEET, 1, 0);
        await flushSourcedEdits();

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
