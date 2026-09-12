import { afterEach, describe, expect, it, vi } from "vitest";

import { PRESENCE_TTL_MS, type Presence } from "@/lib/collab/presence";
import { modelCol } from "@/lib/grid/colSpace";
import {
    claimCell,
    claimCursor,
    getPresences,
    onPresenceChanged,
    setClaimHandler,
    setCursorHandler,
    setPresences,
    type HeldCell,
} from "@/lib/grid/presenceBridge";

afterEach(() => {
    setPresences([]);
    setClaimHandler(null);
    setCursorHandler(null);
});

const on = (endpointId: string, editing = true, readOnly = false): Presence => ({
    endpointId,
    sheetId: "sheet_1",
    col: modelCol(0),
    row: 3,
    heldAt: 1_000,
    editing,
    readOnly,
});

describe("presence arriving from a session", () => {
    it("is held and announced to every mounted pane", () => {
        const one = vi.fn();
        const two = vi.fn();
        const drop = onPresenceChanged(one);
        onPresenceChanged(two);

        setPresences([on("sam")]);

        expect(getPresences()).toEqual([on("sam")]);
        expect(one).toHaveBeenCalledTimes(1);
        expect(two).toHaveBeenCalledTimes(1);

        drop();
        setPresences([]);
        expect(one).toHaveBeenCalledTimes(1);
        expect(two).toHaveBeenCalledTimes(2);
    });

    it("repaints for a peer that only moved its cursor", () => {
        const paint = vi.fn();
        onPresenceChanged(paint);
        setPresences([on("sam", false)]);
        expect(getPresences()[0].editing).toBe(false);
        expect(paint).toHaveBeenCalledTimes(1);
    });

    it("hands back one array for every empty table, so a clear is not a change", () => {
        setPresences([]);
        const first = getPresences();
        setPresences([]);
        expect(getPresences()).toBe(first);
    });

    /**
     * A heartbeat every quarter second per peer, each one a full grid
     * render, is the grid re-rendering all day for a marker that has not
     * moved - and the jank a debater feels while their partner idles.
     */
    it("does not repaint for a heartbeat that moved nobody", () => {
        const paint = vi.fn();
        onPresenceChanged(paint);
        setPresences([on("sam"), on("kim")]);
        expect(paint).toHaveBeenCalledTimes(1);

        setPresences([{ ...on("sam"), heldAt: 1_250 }, on("kim")]);
        expect(paint).toHaveBeenCalledTimes(1);

        setPresences([{ ...on("sam"), heldAt: 1_500, row: 4 }, on("kim")]);
        expect(paint).toHaveBeenCalledTimes(2);
        setPresences([on("kim")]);
        expect(paint).toHaveBeenCalledTimes(3);
    });

    /**
     * The TTL is read at paint time, so a peer that stops heartbeating
     * stays painted until something repaints. On an idle sheet that is
     * never, so the bridge arms a paint for the moment they would expire.
     */
    it("repaints once a marker nobody refreshed has expired", () => {
        vi.useFakeTimers();
        try {
            const paint = vi.fn();
            onPresenceChanged(paint);
            const now = Date.now();
            setPresences([{ ...on("sam"), heldAt: now }]);
            expect(paint).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(PRESENCE_TTL_MS - 10);
            expect(paint).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(20);
            expect(paint).toHaveBeenCalledTimes(2);
            // Once. Nothing is armed for an entry already past.
            vi.advanceTimersByTime(PRESENCE_TTL_MS * 5);
            expect(paint).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("the cell this side is editing", () => {
    it("reaches whatever session is listening", () => {
        const claims: HeldCell[] = [];
        setClaimHandler((cell) => claims.push(cell));

        claimCell({ sheetId: "sheet_1", col: modelCol(2), row: 7 });
        claimCell(null);

        expect(claims).toEqual([{ sheetId: "sheet_1", col: 2, row: 7 }, null]);
    });

    // A debater flowing alone announces nothing to anybody, and the grid does
    // not know whether anyone is listening.
    it("is a no-op with no session", () => {
        expect(() => claimCell({ sheetId: "sheet_1", col: modelCol(0), row: 0 })).not.toThrow();
    });

    it("stops reaching a session that has ended", () => {
        const claims: HeldCell[] = [];
        setClaimHandler((cell) => claims.push(cell));
        claimCell({ sheetId: "sheet_1", col: modelCol(0), row: 0 });
        setClaimHandler(null);
        claimCell({ sheetId: "sheet_1", col: modelCol(1), row: 1 });
        expect(claims).toHaveLength(1);
    });
});

describe("the cell this side's cursor is on", () => {
    it("travels its own route, so an editor claim is not implied by a selection", () => {
        const claims: HeldCell[] = [];
        const cursors: HeldCell[] = [];
        setClaimHandler((cell) => claims.push(cell));
        setCursorHandler((cell) => cursors.push(cell));

        claimCursor({ sheetId: "sheet_1", col: modelCol(1), row: 4 });
        claimCursor(null);

        expect(cursors).toEqual([{ sheetId: "sheet_1", col: 1, row: 4 }, null]);
        expect(claims).toEqual([]);
    });

    it("is a no-op with no session", () => {
        expect(() => claimCursor({ sheetId: "sheet_1", col: modelCol(0), row: 0 })).not.toThrow();
    });

    it("stops reaching a session that has ended", () => {
        const cursors: HeldCell[] = [];
        setCursorHandler((cell) => cursors.push(cell));
        claimCursor({ sheetId: "sheet_1", col: modelCol(0), row: 0 });
        setCursorHandler(null);
        claimCursor({ sheetId: "sheet_1", col: modelCol(1), row: 1 });
        expect(cursors).toHaveLength(1);
    });
});
