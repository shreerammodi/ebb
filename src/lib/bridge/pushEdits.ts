/**
 * Edits in the flow going back out to the CardMirror document they came from.
 *
 * A cell that arrived over the bridge carries a provenance token naming the
 * document node it was copied out of. When the debater rewrites that cell, this
 * pushes the new text into the document, so the tag they sharpened on the flow
 * is the tag they read back in their file afterwards.
 *
 * A line typed inside a run of those cells goes out too, as a new node right
 * after the one above it. A debater who adds an argument in the middle of a
 * card they flowed is writing a line that belongs in the file with the rest of
 * them, and the document is where the run it joined already lives. A run is
 * what a blank cell ends, and it has to hold a linked cell on both sides of
 * the new line: the one above is the address, and the one below is what keeps
 * the analytic typed under the last line of a send in the flow, since a rule
 * that read upward alone would append every one of them to a document nobody
 * asked to grow. CardMirror answers with the new node's token, and the cell
 * adopts it, so from then on it is an ordinary linked cell.
 *
 * It is silent on the way through. A push runs on every settled edit of a
 * sourced cell, so anything chatty here would talk over the round: success says
 * nothing at all, and each distinct failure says its piece once per session.
 *
 * Three rules bound what may leave. The push is the cell's first line alone,
 * because that is all a token names. Nothing is ever removed from the
 * document, so an empty first line pushes nothing. And only provenance minted
 * on this machine is used, because a partner's token means nothing to the
 * CardMirror running here.
 *
 * Off is dead: without the desktop shell, the integration, and the push setting
 * all on, nothing is queued and no timer runs.
 */

import type Handsontable from "handsontable";
import { toast } from "sonner";

import { isForeignSource, sourceOwner } from "@/lib/collab/foreignSource";
import { getReplica, replicaActor } from "@/lib/collab/replica";
import { gridCol, toModelCol, type ModelCol } from "@/lib/grid/colSpace";
import {
    getActiveHot,
    getActiveSheetId,
    getActiveSpacers,
    notifyGridMutated,
} from "@/lib/grid/hotInstance";
import type { CellSource } from "@/lib/model/flow";

import type { BridgeCall, CardMirrorReply } from "./cardmirror";
import { cardmirrorInsertAfter, cardmirrorReplace } from "./cardmirror";
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

/**
 * What a new line gets instead of the ordinary failure line. Every message
 * above promises the text stayed in the flow, and about a line CardMirror may
 * have written and lost the handle to, that is a promise ebb cannot make.
 */
const UNSETTLED_MESSAGE =
    "CardMirror did not say where that new line went, so ebb will not send it again.";

/** One address in the queue. */
interface QueuedCell {
    sheetId: string;
    row: number;
    col: number;
}

/**
 * What a cell has CardMirror do, read live off the grid: rewrite the node it
 * came from, or create one for a line that has none, after the node the cell
 * above it came from.
 */
type Push =
    | { kind: "replace"; text: string; source: CellSource }
    | { kind: "insertAfter"; text: string; above: CellSource };

const queue = new Map<string, QueuedCell>();
const told = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingSince = 0;
let running: Promise<void> | null = null;

/**
 * Lines that may already be in the document, by the line and the node they
 * were asked to follow.
 *
 * A rewrite is worth retrying: it names a node, and asking twice leaves the
 * same text there. Asking for a new node twice leaves two of them, and a
 * timeout or an `internal` is exactly the case where ebb does not know whether
 * the first one landed - CardMirror answers `internal` for a node it inserted
 * and could not mint a token for. So an outcome that settles nothing bars that
 * line at that anchor for the session, and a refusal that names a reason does
 * not: nothing was written, so the debater's next keystroke may try again.
 */
const unresolved = new Set<string>();

/** One line at one anchor, which is what "already asked for" means here. */
const unresolvedKey = (token: string, text: string): string => `${token}\n${text}`;

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
 * The CardMirror provenance on one cell, when it is provenance this machine may
 * hand back: a token, on a cell that still says something, minted here.
 */
function linkOf(
    hot: Handsontable,
    sheetId: string,
    at: ModelCol,
    row: number,
    col: number,
): CellSource | null {
    // Handsontable types cell meta as an open bag, so the read is asserted the
    // same way the rest of the grid layer asserts className.
    const source = hot.getCellMeta(row, col).source as CellSource | undefined;
    if (!source || source.app !== CARDMIRROR_APP || !source.token) return null;
    // Empty text came from nowhere, the way the rail already reads it: a source
    // that outlived its text names a node this cell no longer stands for.
    if (!firstLine(hot.getDataAtCell(row, col))) return null;
    // A token minted on a partner's machine names a document only they can
    // reach, so handing it to the CardMirror here would rewrite whatever it
    // happened to resolve to, or nothing at all.
    const doc = getReplica();
    if (doc && isForeignSource(sourceOwner(doc.sheets[sheetId], at, row), replicaActor())) {
        return null;
    }
    return source;
}

/**
 * The nearest linked cell `step` away from `row`, inside the same run.
 *
 * A run is what a blank cell ends, which is how a flow separates one argument
 * from the next and how a send with space below it separates one card from the
 * next. Walking over the new lines between here and the link is what lets a
 * debater open a gap and type three of them: each is inside the run, and each
 * finds an address whether or not the one beside it has landed yet.
 */
function linkNear(
    hot: Handsontable,
    sheetId: string,
    at: ModelCol,
    col: number,
    row: number,
    step: 1 | -1,
): CellSource | null {
    const rows = hot.countRows();
    for (let r = row + step; r >= 0 && r < rows; r += step) {
        const link = linkOf(hot, sheetId, at, r, col);
        if (link) return link;
        if (!firstLine(hot.getDataAtCell(r, col))) return null;
    }
    return null;
}

/**
 * What this cell would push right now, or null when it may not push at all.
 *
 * Asked twice: once when the edit is queued, so a cell that can never push
 * installs no timer, and again at flush, because the cell may have been edited,
 * emptied, or re-sourced inside the window.
 */
function pushable(sheetId: string, row: number, col: number): Push | null {
    if (!cardmirrorPushLive()) return null;
    const hot = getActiveHot();
    // The grid holds one sheet at a time, so a queued cell on a sheet the user
    // has since left has no live text to read. Whatever sits at that address on
    // the sheet now would rewrite the document from the wrong cell.
    if (!hot || getActiveSheetId() !== sheetId) return null;
    // A spacer stands for a speech this sheet does not hold, so nothing there
    // is a cell that could have come from a document.
    const at = toModelCol(gridCol(col), getActiveSpacers());
    if (at === null) return null;
    const text = firstLine(hot.getDataAtCell(row, col));
    if (!text) return null;
    const source = linkOf(hot, sheetId, at, row, col);
    if (source) return { kind: "replace", text, source };
    // A new line, and only one the run closes over on both sides. The link
    // above is the address; the link below is the proof that this is an inside,
    // and it is what keeps the analytic typed under the last line of a send in
    // the flow: a rule that read upward alone would append every one of them to
    // a document nobody asked to grow.
    const above = linkNear(hot, sheetId, at, col, row, -1);
    if (!above || !linkNear(hot, sheetId, at, col, row, 1)) return null;
    if (unresolved.has(unresolvedKey(above.token, text))) return null;
    return { kind: "insertAfter", text, above };
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
 * Adopts the token CardMirror minted for the node it just wrote.
 *
 * A rewrite has to: the stored token anchors on the text that was overwritten,
 * so without this exactly one edit per cell would ever land. `key` and `title`
 * are left alone there, since they name the same card in the same document, and
 * `key` going stale under an edit is what it already did before anything
 * pushed.
 *
 * A new line adopts one for the first time, which is what turns it into a
 * linked cell: it wears the rail, jump to source reaches it, and its next edit
 * pushes as a rewrite. It carries the document title of the line above it,
 * which is the document it was written into, and no `key`: a key is minted by
 * the sending app for an item it sent, and nothing sent this line.
 */
function adopt(cell: QueuedCell, push: Push, fresh: string | undefined): void {
    if (!fresh) return;
    const hot = getActiveHot();
    if (!hot || getActiveSheetId() !== cell.sheetId) return;
    const live = hot.getCellMeta(cell.row, cell.col).source as CellSource | undefined;
    if (push.kind === "replace") {
        // Only onto the cell that is still the one that was pushed. A cell
        // emptied while the request was out has dropped its provenance, and
        // handing it back would strand a claim about a card on a blank cell.
        if (!live || live.token !== push.source.token) return;
        hot.setCellMeta(cell.row, cell.col, "source", { ...live, token: fresh });
    } else {
        // Only while the cell is still the line that went out. Rows shift and
        // text moves on while a request is in flight, and provenance is a claim
        // about where a cell's text came from: on any other text it would be a
        // claim about a node holding something else.
        if (live || firstLine(hot.getDataAtCell(cell.row, cell.col)) !== push.text) return;
        hot.setCellMeta(cell.row, cell.col, "source", {
            app: CARDMIRROR_APP,
            token: fresh,
            ...(push.above.title ? { title: push.above.title } : {}),
        });
        // A debater who types the lower of two new lines first leaves the
        // upper cell blank, and a blank cell ends the run, so the lower one
        // was outside it and pushed nothing. It is inside it now, so it is
        // asked again - after this one, which is the order the two belong in.
        // A cell that is blank or already linked is left alone: it has either
        // nothing to say or nothing new to say.
        const next = { ...cell, row: cell.row + 1 };
        if (
            firstLine(hot.getDataAtCell(next.row, next.col)) &&
            !hot.getCellMeta(next.row, next.col).source
        ) {
            queuePushEdit(next.sheetId, next.row, next.col);
        }
    }
    // No undo action and no op. The token is local provenance about a document
    // only this machine can reach, so a partner's copy of the cell can do
    // nothing with it; and an undo step for a write the user never made would
    // eat the undo they were about to spend on their own edit. The snapshot
    // carries it to the store, and from there to the file.
    notifyGridMutated();
}

/**
 * Files a line whose fate the answer did not settle, so it is never asked for
 * twice, and answers whether it filed anything. A rewrite is left alone: see
 * `unresolved`.
 */
function holdUnresolved(push: Push): boolean {
    if (push.kind !== "insertAfter") return false;
    unresolved.add(unresolvedKey(push.above.token, push.text));
    return true;
}

/** Files the outcome: a fresh token on success, one toast on anything else. */
function report(call: BridgeCall<CardMirrorReply>, cell: QueuedCell, push: Push): void {
    if (!call.ok) {
        // A timeout is the one transport failure that settles nothing: the
        // request reached a peer that stopped answering, which may have written
        // the node first. The rest never left this machine, or arrived as a
        // reply ebb could not read, and a reply it could not read is an answer
        // about a request CardMirror did process.
        const unsettled = call.error === "timeout" || call.error === "bad-response";
        if (unsettled && holdUnresolved(push)) {
            tell(`unsettled:${call.error}`, UNSETTLED_MESSAGE);
            return;
        }
        tell(call.error, PUSH_MESSAGE[call.error] ?? PUSH_FALLBACK);
        return;
    }
    const reply = call.value;
    // Checked before `ok`, because a queued route answers `ok: true` with
    // nothing done. Approving in CardMirror replays the queued request, so it
    // does land there eventually - but the token minted on that replay is never
    // sent back here. For a rewrite that means this cell's link is stale from
    // that moment on and its next edit comes back `not-found`; for a new line
    // it means a node may exist that nothing here can name, so the line is held
    // rather than asked for again on the next keystroke.
    if (reply.pending) {
        holdUnresolved(push);
        tell(PENDING_REASON, PENDING_MESSAGE);
        return;
    }
    if (reply.ok) {
        adopt(cell, push, reply.source);
        return;
    }
    const error = reply.error ?? "";
    // CardMirror answers this for a node it wrote and could not mint a token
    // for, among other things, so what it settles is nothing.
    if (error === "internal" && holdUnresolved(push)) {
        tell(`unsettled:${error}`, UNSETTLED_MESSAGE);
        return;
    }
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
    const push = pushable(cell.sheetId, cell.row, cell.col);
    if (!push) return;
    const call =
        push.kind === "replace"
            ? await cardmirrorReplace(push.source.token, push.text)
            : await cardmirrorInsertAfter(push.above.token, push.text);
    report(call, cell, push);
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
 * Notes that a cell was edited, whether it is linked or a new line between two
 * that are. The address alone is stored: the text and the token are read back
 * off the grid at flush, so a cell edited three times inside one window pushes
 * once, carrying what it says when the window closes and the token it holds by
 * then.
 */
export function queuePushEdit(sheetId: string, row: number, col: number): void {
    if (!pushable(sheetId, row, col)) return;
    if (queue.size === 0) pendingSince = Date.now();
    queue.set(`${sheetId}:${row}:${col}`, { sheetId, row, col });

    // The ceiling bounds how far behind the document may fall to MAX_WAIT_MS
    // rather than to the length of the burst, which during a speech is the whole
    // speech.
    if (Date.now() - pendingSince >= MAX_WAIT_MS) {
        void flushPushEdits();
        return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void flushPushEdits(), DEBOUNCE_MS);
}

/**
 * Pushes everything queued and settles when the document has heard all of it.
 * The quit path awaits this, so an edit made half a second before the window
 * closes still reaches the document.
 */
export function flushPushEdits(): Promise<void> {
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

/** Test seam: forgets the queue, the drain, the timer, the holds, the toasts. */
export function resetPushEdits(): void {
    clearTimeout(timer);
    timer = undefined;
    pendingSince = 0;
    queue.clear();
    running = null;
    unresolved.clear();
    told.clear();
}
