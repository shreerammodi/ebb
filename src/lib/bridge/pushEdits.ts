/**
 * Edits in the flow going back out to the CardMirror document they came from.
 *
 * A cell that arrived over the bridge carries a provenance token naming the
 * document node it was copied out of. When the debater rewrites that cell, this
 * pushes the new text into the document, so the tag they sharpened on the flow
 * is the tag they read back in their file afterwards.
 *
 * It is silent on the way through. A push runs on every settled edit of a
 * sourced cell, so anything chatty here would talk over the round: success says
 * nothing at all, and each distinct failure says its piece once per session.
 *
 * Three rules bound what may leave. The push is the cell's first line alone,
 * because that is all the token names. Nothing is ever removed from the
 * document, so an empty first line pushes nothing. And only provenance minted
 * on this machine is used, because a partner's token means nothing to the
 * CardMirror running here.
 *
 * Off is dead: without the desktop shell, the integration, and the push setting
 * all on, nothing is queued and no timer runs.
 */

import { toast } from "sonner";

import { isForeignSource, sourceOwner } from "@/lib/collab/foreignSource";
import { getReplica, replicaActor } from "@/lib/collab/replica";
import { gridCol, toModelCol } from "@/lib/grid/colSpace";
import {
    getActiveHot,
    getActiveSheetId,
    getActiveSpacers,
    notifyGridMutated,
} from "@/lib/grid/hotInstance";
import type { CellSource } from "@/lib/model/flow";

import type { BridgeCall, CardMirrorReply } from "./cardmirror";
import { cardmirrorReplace } from "./cardmirror";
import { CONSENT_MESSAGE } from "./commands";
import { cardmirrorPushLive } from "./enabled";
import { CARDMIRROR_APP } from "./flowPlan";

/**
 * The autosave's window, for the same reason it holds there: a debater types
 * in bursts, and one request per settled keystroke would be one request per
 * letter deleted from a tag.
 */
const DEBOUNCE_MS = 500;

/**
 * Longest an edit may sit unpushed. A debounce that only ever resets never
 * fires during fast typing, which is exactly when the document would fall
 * furthest behind the flow.
 */
const MAX_WAIT_MS = 2_000;

/**
 * What a failed push tells the user. Keyed by transport failure and by the
 * route's own error codes alike, because both are one thing from here: a
 * reason the document did not take the edit.
 *
 * Each line says where the text ended up. The edit is in the flow and stays
 * there, so a message that named only the failure would read as lost work.
 *
 * `unsupported` is absent because the gate is desktop-only, so the transport's
 * answer for the web build cannot be reached from here. Anything else unnamed
 * takes the fallback, which says as much as can be said without guessing at a
 * cause.
 */
const PUSH_MESSAGE: Record<string, string> = {
    "not-registered": "CardMirror has never run here, so your edit stayed in your flow.",
    "not-running": "CardMirror is not running. Your edits are staying in your flow.",
    timeout: "CardMirror did not answer, so your edit stayed in your flow.",
    "bad-response": "CardMirror sent an answer ebb could not read, so your edit stayed.",
    "not-found": "ebb could not find that card in the document, so your edit stayed in your flow.",
    "doc-readonly": "That CardMirror document is in read mode, so your edit stayed in your flow.",
    // ebb sends a token it was handed and one trimmed, non-empty line, so a
    // refusal for a malformed request means the route is not there: a
    // CardMirror from before it existed answers 404 with this code.
    "bad-request":
        "CardMirror would not take that edit. An older CardMirror does not know how, so check it for an update.",
};

const PUSH_FALLBACK = "CardMirror could not take that edit, so it stayed in your flow.";

/**
 * The reason a queued push is filed under, kept apart from the error codes so
 * a refusal and a prompt still waiting each get their own say.
 */
const PENDING_REASON = "pending";

const PENDING_MESSAGE =
    "Waiting for approval in CardMirror. Your edit lands there when you allow ebb.";

/** One address in the queue. */
interface QueuedCell {
    sheetId: string;
    row: number;
    col: number;
}

/** What a cell has to push, read live off the grid. */
interface Pushable {
    text: string;
    source: CellSource;
}

const queue = new Map<string, QueuedCell>();
const told = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingSince = 0;
let running: Promise<void> | null = null;

/**
 * The cell's first line, trimmed, which is the only text a push may name.
 *
 * A cite rides as a second line inside the tag's cell and a cell-mode send
 * joins a whole card into one cell under the first item's token, so the token
 * describes the first line and the lines under it were never that document
 * node's text. Anything but a string reads as empty, the way the emptying rule
 * already treats a cleared cell.
 */
export function firstLine(value: unknown): string {
    if (typeof value !== "string") return "";
    const end = value.indexOf("\n");
    return (end === -1 ? value : value.slice(0, end)).trim();
}

/**
 * What this cell would push right now, or null when it may not push at all.
 *
 * Asked twice: once when the edit is queued, so a cell that can never push
 * installs no timer, and again at flush, because the cell may have been edited,
 * emptied, or re-sourced inside the window.
 */
function pushable(sheetId: string, row: number, col: number): Pushable | null {
    if (!cardmirrorPushLive()) return null;
    const hot = getActiveHot();
    // The grid holds one sheet at a time, so a queued cell on a sheet the user
    // has since left has no live text to read. Whatever sits at that address on
    // the sheet now would rewrite the document from the wrong cell.
    if (!hot || getActiveSheetId() !== sheetId) return null;
    // Handsontable types cell meta as an open bag, so the read is asserted the
    // same way the rest of the grid layer asserts className.
    const source = hot.getCellMeta(row, col).source as CellSource | undefined;
    if (!source || source.app !== CARDMIRROR_APP || !source.token) return null;
    // A spacer stands for a speech this sheet does not hold, so nothing there
    // is a cell that could have come from a document.
    const at = toModelCol(gridCol(col), getActiveSpacers());
    if (at === null) return null;
    // A token minted on a partner's machine names a document only they can
    // reach, so handing it to the CardMirror here would rewrite whatever it
    // happened to resolve to, or nothing at all.
    const doc = getReplica();
    if (doc && isForeignSource(sourceOwner(doc.sheets[sheetId], at, row), replicaActor())) {
        return null;
    }
    const text = firstLine(hot.getDataAtCell(row, col));
    if (!text) return null;
    return { text, source };
}

/**
 * One toast per reason per session. The first failure names what is wrong and
 * what to do about it; the tenth repetition of it during a speech is noise over
 * a problem the user has already been told about and cannot fix mid-round.
 */
function tell(reason: string, message: string): void {
    if (told.has(reason)) return;
    told.add(reason);
    toast(message);
}

/**
 * Adopts the token CardMirror minted for the text it just wrote. The stored one
 * anchors on the text that was overwritten, so without this exactly one edit
 * per cell would ever land.
 *
 * `key` and `title` are left alone: they name the same card in the same
 * document, and `key` going stale under an edit is what it already did before
 * anything pushed.
 */
function adoptToken(cell: QueuedCell, source: CellSource, fresh: string | undefined): void {
    if (!fresh) return;
    const hot = getActiveHot();
    if (!hot || getActiveSheetId() !== cell.sheetId) return;
    // Only onto the cell that is still the one that was pushed. A cell emptied
    // while the request was out has dropped its provenance, and handing it back
    // would strand a claim about a card on a blank cell.
    const live = hot.getCellMeta(cell.row, cell.col).source as CellSource | undefined;
    if (!live || live.token !== source.token) return;
    hot.setCellMeta(cell.row, cell.col, "source", { ...live, token: fresh });
    // No undo action and no op. The refreshed token is local provenance about a
    // document only this machine can reach, so a partner's copy of the cell can
    // do nothing with it; and an undo step for a write the user never made would
    // eat the undo they were about to spend on their own edit. The snapshot
    // carries it to the store, and from there to the file.
    notifyGridMutated();
}

/** Files the outcome: a fresh token on success, one toast on anything else. */
function report(call: BridgeCall<CardMirrorReply>, cell: QueuedCell, source: CellSource): void {
    if (!call.ok) {
        tell(call.error, PUSH_MESSAGE[call.error] ?? PUSH_FALLBACK);
        return;
    }
    const reply = call.value;
    // Checked before `ok`, because a queued route answers `ok: true` with
    // nothing done. Approving in CardMirror replays the queued replace, so the
    // text does land there eventually - but the token minted on that replay is
    // never sent back here, so this cell's link is stale from that moment on and
    // its next edit comes back `not-found`. Nothing is written back either way:
    // the stored token is all ebb has, and it no longer describes anything.
    if (reply.pending) {
        tell(PENDING_REASON, PENDING_MESSAGE);
        return;
    }
    if (reply.ok) {
        adoptToken(cell, source, reply.source);
        return;
    }
    const error = reply.error ?? "";
    if (error === "doc-not-open") {
        const title = reply.docTitle;
        tell(
            error,
            title
                ? `Open "${title}" in CardMirror to receive your edits.`
                : "Open the document in CardMirror to receive your edits.",
        );
        return;
    }
    tell(error, CONSENT_MESSAGE[error] ?? PUSH_MESSAGE[error] ?? PUSH_FALLBACK);
}

async function pushCell(cell: QueuedCell): Promise<void> {
    const live = pushable(cell.sheetId, cell.row, cell.col);
    if (!live) return;
    report(await cardmirrorReplace(live.source.token, live.text), cell, live.source);
}

/**
 * One request at a time, and the queue is re-read each turn, so an edit made
 * while a push is in flight is picked up by the drain already running rather
 * than racing it.
 */
async function drain(): Promise<void> {
    for (;;) {
        const next = queue.entries().next();
        if (next.done) return;
        const [key, cell] = next.value;
        queue.delete(key);
        await pushCell(cell);
    }
}

/**
 * Notes that a sourced cell was edited. The address alone is stored: the text
 * and the token are read back off the grid at flush, so a cell edited three
 * times inside one window pushes once, carrying what it says when the window
 * closes and the token it holds by then.
 */
export function queueSourcedEdit(sheetId: string, row: number, col: number): void {
    if (!pushable(sheetId, row, col)) return;
    if (queue.size === 0) pendingSince = Date.now();
    queue.set(`${sheetId}:${row}:${col}`, { sheetId, row, col });

    // The ceiling bounds how far behind the document may fall to MAX_WAIT_MS
    // rather than to the length of the burst, which during a speech is the whole
    // speech.
    if (Date.now() - pendingSince >= MAX_WAIT_MS) {
        void flushSourcedEdits();
        return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void flushSourcedEdits(), DEBOUNCE_MS);
}

/**
 * Pushes everything queued and settles when the document has heard all of it.
 * The quit path awaits this, so an edit made half a second before the window
 * closes still reaches the document.
 */
export function flushSourcedEdits(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    // A second caller joins the drain already running instead of opening a
    // parallel one. That drain runs until the queue is empty, so whatever the
    // joiner queued is inside the work its promise waits on.
    if (running) return running;
    const drained = (async () => {
        try {
            await drain();
        } finally {
            running = null;
        }
    })();
    running = drained;
    return drained;
}

/** Test seam: forgets the queue, the drain, the timer and what was toasted. */
export function resetPushEdits(): void {
    clearTimeout(timer);
    timer = undefined;
    pendingSince = 0;
    queue.clear();
    running = null;
    told.clear();
}
