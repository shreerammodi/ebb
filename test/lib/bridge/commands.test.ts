import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runJumpToSource, runSendToDoc } from "@/lib/bridge/commands";
import { setActiveHot } from "@/lib/grid/hotInstance";
import type { CellSource } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const invoked = vi.mocked(invoke);
const toasted = vi.mocked(toast);

const SOURCE: CellSource = {
    app: "cardmirror",
    token: "cmsrc1.a",
    key: "doc-1|perm solves",
    title: "AT - Cap K",
};

/** A one-cell grid whose text and provenance the test controls. */
function makeGrid(text: string | null, source?: CellSource) {
    return {
        getSelectedLast: () => [0, 0],
        getSelectedRange: () => [
            {
                getTopLeftCorner: () => ({ row: 0, col: 0 }),
                getBottomRightCorner: () => ({ row: 0, col: 0 }),
            },
        ],
        getCellMeta: () => ({ source }),
        getDataAtCell: () => text,
    };
}

const lastToast = () => toasted.mock.calls.at(-1)?.[0];

beforeEach(() => {
    invoked.mockReset();
    toasted.mockReset();
    setActiveHot(null, null, null, 0);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    useFlowStore.setState({ cardmirrorTextType: "analytic", cardmirrorEnabled: true });
});

afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("jump to source", () => {
    it("hands the cell's token to the host and stays quiet on success", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
        invoked.mockResolvedValue({ ok: true });

        await runJumpToSource();

        expect(invoked).toHaveBeenCalledWith("cardmirror_jump", { source: "cmsrc1.a" });
        expect(toasted).not.toHaveBeenCalled();
    });

    it("says so on a cell that was typed here", async () => {
        setActiveHot(makeGrid("typed") as never, vi.fn(), null, 0);
        await runJumpToSource();
        expect(invoked).not.toHaveBeenCalled();
        expect(lastToast()).toBe("This cell did not come from CardMirror.");
    });

    it("names the document to open when it is closed", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
        invoked.mockResolvedValue({ ok: false, error: "doc-not-open", docTitle: "AT - Cap K" });

        await runJumpToSource();
        expect(lastToast()).toBe('Open "AT - Cap K" in CardMirror first.');
    });

    it("explains a card that is gone and a source it cannot read", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);

        invoked.mockResolvedValue({ ok: false, error: "not-found" });
        await runJumpToSource();
        expect(lastToast()).toBe("That card is no longer in the document.");

        invoked.mockResolvedValue({ ok: false, error: "bad-request" });
        await runJumpToSource();
        expect(lastToast()).toBe("CardMirror could not read this cell's source.");
    });

    it("reports each transport failure in its own words", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
        const cases: [string, string][] = [
            ["not-registered", "CardMirror has never run on this machine."],
            ["not-running", "CardMirror is not running."],
            ["timeout", "CardMirror did not answer."],
            ["bad-response", "CardMirror sent something ebb could not read."],
        ];
        for (const [error, message] of cases) {
            invoked.mockRejectedValue(error);
            await runJumpToSource();
            expect(lastToast()).toBe(message);
        }
    });

    it("falls back to a readable message on an unnamed failure", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
        invoked.mockRejectedValue(new Error("boom"));
        await runJumpToSource();
        expect(lastToast()).toBe("CardMirror sent something ebb could not read.");
    });
});

describe("send to doc", () => {
    it("sends the selected text with the configured type", async () => {
        setActiveHot(makeGrid("Perm solves") as never, vi.fn(), null, 0);
        useFlowStore.setState({ cardmirrorTextType: "tag" });
        invoked.mockResolvedValue({ ok: true, inserted: true, docTitle: "1AR" });

        await runSendToDoc();

        expect(invoked).toHaveBeenCalledWith("cardmirror_insert", {
            text: "Perm solves",
            role: "tag",
            newParagraph: true,
        });
        expect(lastToast()).toBe('Sent to "1AR".');
    });

    it("sends one line per selected cell and skips blanks", async () => {
        const texts: Record<string, string | null> = {
            "0,0": "First",
            "1,0": "   ",
            "2,0": "Second",
        };
        setActiveHot(
            {
                getSelectedLast: () => [0, 0],
                getSelectedRange: () => [
                    {
                        getTopLeftCorner: () => ({ row: 0, col: 0 }),
                        getBottomRightCorner: () => ({ row: 2, col: 0 }),
                    },
                ],
                getCellMeta: () => ({}),
                getDataAtCell: (r: number, c: number) => texts[`${r},${c}`] ?? null,
            } as never,
            vi.fn(),
            null,
            0,
        );
        invoked.mockResolvedValue({ ok: true, inserted: true });

        await runSendToDoc();

        // One newline per cell: CardMirror makes one block per line, so a
        // blank line here would land an empty paragraph in the document.
        expect(invoked.mock.calls[0][1]).toMatchObject({ text: "First\nSecond" });
        expect(lastToast()).toBe("Sent to CardMirror.");
    });

    it("asks for text before sending an empty selection", async () => {
        setActiveHot(makeGrid(null) as never, vi.fn(), null, 0);
        await runSendToDoc();
        expect(invoked).not.toHaveBeenCalled();
        expect(lastToast()).toBe("Select a cell with text to send.");
    });

    it("explains every insert refusal", async () => {
        setActiveHot(makeGrid("Perm solves") as never, vi.fn(), null, 0);
        const cases: [string, string][] = [
            ["no-target-doc", "Open a document in CardMirror first."],
            ["doc-readonly", "That CardMirror document is in read mode."],
            ["bad-request", "CardMirror would not take that text."],
            ["internal", "CardMirror could not take that text."],
        ];
        for (const [error, message] of cases) {
            invoked.mockResolvedValue({ ok: false, error });
            await runSendToDoc();
            expect(lastToast()).toBe(message);
        }
    });
});

const SHEET = "sheet-1";

interface SendGrid {
    /** The cell's live meta, for asserting what the send left on it. */
    at(row: number): { source?: CellSource };
    rendered: () => void;
    mutated: () => void;
}

/**
 * A one-column grid over `texts`, selected top to bottom: what the send reads,
 * plus the two hooks a link writes through.
 */
function sendGrid(texts: readonly (string | null)[], seeded: Record<number, CellSource> = {}) {
    const meta = new Map<number, { source?: CellSource }>(
        Object.entries(seeded).map(([row, source]) => [Number(row), { source }]),
    );
    const rendered = vi.fn();
    const mutated = vi.fn();
    const hot = {
        getSelectedLast: () => [0, 0],
        getSelectedRange: () => [
            {
                getTopLeftCorner: () => ({ row: 0, col: 0 }),
                getBottomRightCorner: () => ({ row: texts.length - 1, col: 0 }),
            },
        ],
        getCellMeta: (row: number) => meta.get(row) ?? {},
        setCellMeta: (row: number, _col: number, key: string, value: unknown) => {
            meta.set(row, { ...(meta.get(row) ?? {}), [key]: value as CellSource });
        },
        getDataAtCell: (row: number) => texts[row] ?? null,
        render: rendered,
    };
    setActiveHot(hot as never, mutated, SHEET, 0);
    const grid: SendGrid = { at: (row) => meta.get(row) ?? {}, rendered, mutated };
    return grid;
}

describe("the cells a send puts in the document", () => {
    it("links each one to the block it made, so it wears the rail", async () => {
        const grid = sendGrid(["First", "Second"]);
        invoked.mockResolvedValue({
            ok: true,
            inserted: true,
            docTitle: "1AR",
            sources: ["cmsrc1.first", "cmsrc1.second"],
        });

        await runSendToDoc();

        // No key: a key names an item the document sent, and this went the
        // other way. The title is the document the text landed in.
        expect(grid.at(0).source).toEqual({
            app: "cardmirror",
            token: "cmsrc1.first",
            title: "1AR",
        });
        expect(grid.at(1).source?.token).toBe("cmsrc1.second");
        // The rail is drawn per cell on render, and no cell's text changed.
        expect(grid.rendered).toHaveBeenCalled();
        expect(grid.mutated).toHaveBeenCalled();
    });

    it("charges a cell for every line it sent and keeps the first one's token", async () => {
        const grid = sendGrid(["Perm solves\nSmith 24", "Second"]);
        invoked.mockResolvedValue({
            ok: true,
            inserted: true,
            sources: ["cmsrc1.perm", "cmsrc1.cite", "cmsrc1.second"],
        });

        await runSendToDoc();

        expect(grid.at(0).source?.token).toBe("cmsrc1.perm");
        expect(grid.at(1).source?.token).toBe("cmsrc1.second");
    });

    it("links nothing when the blocks named do not account for the lines sent", async () => {
        const grid = sendGrid(["First", "Second"]);
        invoked.mockResolvedValue({ ok: true, inserted: true, sources: ["cmsrc1.first"] });

        await runSendToDoc();

        // One token for two cells is a mapping ebb cannot make, and a cell
        // claiming the wrong block is worse than one claiming none.
        expect(grid.at(0).source).toBeUndefined();
        expect(grid.at(1).source).toBeUndefined();
        expect(lastToast()).toBe("Sent to CardMirror.");
    });

    it("links nothing when the reply names no blocks at all", async () => {
        const grid = sendGrid(["First"]);
        // A CardMirror too old to name what it inserted, and a body-kind send,
        // both land here. The send still happened.
        invoked.mockResolvedValue({ ok: true, inserted: true, docTitle: "1AR" });

        await runSendToDoc();

        expect(grid.at(0).source).toBeUndefined();
        expect(grid.rendered).not.toHaveBeenCalled();
        expect(lastToast()).toBe('Sent to "1AR".');
    });

    it("leaves a cell that already came from a document pointing where it came from", async () => {
        const grid = sendGrid(["Perm solves", "Second"], { 0: SOURCE });
        invoked.mockResolvedValue({
            ok: true,
            inserted: true,
            sources: ["cmsrc1.copy", "cmsrc1.second"],
        });

        await runSendToDoc();

        expect(grid.at(0).source).toEqual(SOURCE);
        expect(grid.at(1).source?.token).toBe("cmsrc1.second");
    });

    it("links nothing once the grid is showing another sheet", async () => {
        const grid = sendGrid(["First"]);
        invoked.mockImplementation(async () => {
            setActiveHot(null, null, "sheet-2", 0);
            return { ok: true, inserted: true, sources: ["cmsrc1.first"] };
        });

        await runSendToDoc();

        expect(grid.at(0).source).toBeUndefined();
    });

    it("links nothing behind a consent prompt, since nothing was written", async () => {
        const grid = sendGrid(["First"]);
        invoked.mockResolvedValue({ ok: true, pending: "consent", sources: ["cmsrc1.first"] });

        await runSendToDoc();

        expect(grid.at(0).source).toBeUndefined();
    });
});

describe("the desktop-only gate", () => {
    it("makes both commands silent no-ops when the switch is off", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
        useFlowStore.setState({ cardmirrorEnabled: false });

        await runJumpToSource();
        await runSendToDoc();

        expect(invoked).not.toHaveBeenCalled();
        expect(toasted).not.toHaveBeenCalled();
    });

    it("makes both commands silent no-ops on the web build", async () => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

        await runJumpToSource();
        await runSendToDoc();

        expect(invoked).not.toHaveBeenCalled();
        expect(toasted).not.toHaveBeenCalled();
    });
});

describe("CardMirror's consent gate", () => {
    const WAITING = "Waiting for approval in CardMirror. No need to try again.";

    beforeEach(() => {
        setActiveHot(makeGrid("Perm solves", SOURCE) as never, vi.fn(), null, 0);
    });

    it("waits instead of claiming a send that has not happened yet", async () => {
        // A queued insert answers ok:true with inserted:false - accepted for
        // delivery, nothing written. Reporting that as "Sent" would be a lie.
        invoked.mockResolvedValue({ ok: true, inserted: false, pending: "consent" });

        await runSendToDoc();

        expect(lastToast()).toBe(WAITING);
    });

    it("says a queued jump is waiting rather than staying silent", async () => {
        invoked.mockResolvedValue({ ok: true, jumped: false, pending: "consent" });

        await runJumpToSource();

        expect(lastToast()).toBe(WAITING);
    });

    it("leaves a queued action queued, since approving replays it", async () => {
        invoked.mockResolvedValue({ ok: true, inserted: false, pending: "consent" });

        await runSendToDoc();

        expect(invoked).toHaveBeenCalledTimes(1);
    });

    it("treats an unknown pending kind as unfinished, not as success", async () => {
        invoked.mockResolvedValue({ ok: true, inserted: false, pending: "something-new" });

        await runSendToDoc();

        expect(lastToast()).not.toBe("Sent to CardMirror.");
    });

    it("explains every consent refusal, on both routes alike", async () => {
        const cases: [string, string][] = [
            ["unidentified", "CardMirror did not recognize ebb. Check for an ebb update."],
            ["inserts-disabled", "CardMirror is refusing inserts from other apps."],
            [
                "not-allowed",
                "CardMirror is blocking ebb. Allow it under External apps in its settings.",
            ],
        ];
        for (const [error, message] of cases) {
            invoked.mockResolvedValue({ ok: false, error });

            await runSendToDoc();
            expect(lastToast(), `insert ${error}`).toBe(message);

            await runJumpToSource();
            expect(lastToast(), `jump ${error}`).toBe(message);
        }
    });

    it("never routes around a refusal with a second attempt", async () => {
        invoked.mockResolvedValue({ ok: false, error: "not-allowed" });

        await runSendToDoc();
        await runJumpToSource();

        // One call per command: a denial is the user's decision, so there is
        // no retry and no other way to the document.
        expect(invoked).toHaveBeenCalledTimes(2);
    });
});

describe("a cell a partner sourced", () => {
    it("degrades to the open-first path instead of handing over a dead token", async () => {
        const { seedDoc } = await import("@/lib/collab/doc");
        const { applyOp } = await import("@/lib/collab/ops");
        const { createClock } = await import("@/lib/collab/stamp");
        const { seedReplica } = await import("@/lib/collab/replica");
        const { setActiveHot } = await import("@/lib/grid/hotInstance");
        const { makeFlowRound } = await import("@/lib/model/flow");

        const round = makeFlowRound({});
        const flow = round.sheets.find((s) => s.kind !== "cx")!;
        flow.data = [["from a partner"]];
        const doc = applyOp(
            seedDoc(round),
            {
                kind: "cellMeta",
                sheetId: flow.id,
                col: 0,
                row: 0,
                meta: {
                    source: { app: "cardmirror", token: "theirs", key: "k", title: "Aff Core" },
                },
            },
            { actor: "them", clock: createClock("them", () => 9_000) },
        );
        seedReplica(round, "me", doc);

        const hot = {
            getSelectedLast: () => [0, 0, 0, 0],
            getCellMeta: () => ({
                source: { app: "cardmirror", token: "theirs", key: "k", title: "Aff Core" },
            }),
        };
        setActiveHot(hot as never, vi.fn(), flow.id, 0);

        await runJumpToSource();
        // The bridge is never asked: that token means nothing on this machine.
        expect(invoke).not.toHaveBeenCalledWith("cardmirror_jump", expect.anything());
    });
});
