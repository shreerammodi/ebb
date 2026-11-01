/**
 * Opening, creating, and saving the one flow file ebb has open.
 *
 * Autosave keeps the shape it had against the database - a 500ms debounce, a
 * sequence guard so a slow earlier write cannot report over a newer one, and a
 * flush on teardown - because that behavior is what makes losing a round
 * impossible, and none of it depended on the storage being a database. Only the
 * sink changed, and it gained an atomic write on the way.
 *
 * A new flow is written to the flows folder the moment it is created, so there
 * is never an unanchored buffer, never a dirty state, and never a save prompt
 * between the user and a speech that has already started.
 */

import type { StoreApi } from "zustand";

import { persistReplica } from "@/lib/collab/persist";
import type { FlowRound } from "@/lib/model/flow";

import { parseFlowFile, parseLegacyExport, serializeFlow } from "./flowFile";
import { getFlowFs, type FlowFs } from "./flowFs";
import { EBB_EXT, basename, suggestFilename, withEbbExt } from "./flowPaths";
import { resolveFlowsDir } from "./flowsDir";
import { loadRecents, promoteRecent, saveRecents } from "./recents";

/**
 * Lifecycle of a single save, reported so the header can reassure the user.
 * "conflict" is distinct from "error" because the fix is a decision, not a
 * retry: the file changed outside ebb and someone has to choose a winner.
 */
export type SaveStatus = "saving" | "saved" | "error" | "conflict";

const DEBOUNCE_MS = 500;

/**
 * Longest an edit may sit unwritten. A debounce that only ever resets never
 * fires during a fast speech, where cell edits land closer together than the
 * window, so a crash would cost the whole burst instead of half a second.
 */
const MAX_WAIT_MS = 2_000;

/** Rust tags a refused overwrite with this; the prefix is a shared contract. */
const CONFLICT_PREFIX = "conflict:";

export function isConflict(err: unknown): boolean {
    return typeof err === "string" && err.startsWith(CONFLICT_PREFIX);
}

/**
 * The version of the open file ebb last saw.
 *
 * Every write carries it back so the shell can tell whether anything else
 * touched the file meanwhile - a sync client pulling a copy from another
 * machine is the realistic case, since the default flows folder sits under
 * Documents, which iCloud syncs by default on many Macs. Keyed by path so a
 * stamp left over from a previously open flow can never be applied to a new
 * one.
 */
let seen: { path: string; mtimeMs: number } | null = null;

function stampFor(path: string): number | null {
    return seen?.path === path ? seen.mtimeMs : null;
}

function remember(path: string, mtimeMs: number): void {
    seen = { path, mtimeMs };
}

/**
 * Test seam: drop the remembered stamp, and any flow left without saving, so
 * suites cannot leak into each other.
 */
export function forgetSeenStamp(): void {
    seen = null;
    abandoned = null;
}

// --- Recents bookkeeping -------------------------------------------------------

/** Record a path as the most recently opened flow. */
export async function noteOpened(path: string, fs?: FlowFs): Promise<void> {
    const io = fs ?? (await getFlowFs());
    await saveRecents(io, promoteRecent(await loadRecents(io), path, Date.now()));
}

// --- Reading -------------------------------------------------------------------

export interface OpenedFlow {
    round: FlowRound;
    /**
     * The round came from the recovery copy because the file never received
     * it. The caller leaves autosave unprimed so the round is written back.
     */
    recovered: boolean;
}

/**
 * Read the flow at `path`, or null when the file is gone - an ordinary outcome
 * for a recent entry whose flow was moved or deleted outside ebb. A file that
 * exists but does not parse throws, because that is a real problem the user
 * needs told about rather than a flow quietly vanishing from the list.
 *
 * A recovery copy that differs from the file is the newer round: it is only
 * left behind when a save reached it and not the file. A torn copy does not
 * parse and is passed over for the file.
 */
export async function readFlowAt(path: string, fs?: FlowFs): Promise<OpenedFlow | null> {
    const io = fs ?? (await getFlowFs());
    const snapshot = await io.readFlow(path);
    if (snapshot === null) return null;
    remember(path, snapshot.mtimeMs);
    if (abandoned === path) abandoned = null;
    const swap = await io.readSwap(path).catch(() => null);
    if (swap !== null && swap !== snapshot.text) {
        try {
            return { round: parseFlowFile(swap), recovered: true };
        } catch {
            // Torn mid-write; the file holds the save before it.
        }
    }
    return { round: parseFlowFile(snapshot.text), recovered: false };
}

// --- Creating and saving -------------------------------------------------------

/**
 * Write a brand-new flow into the flows folder; resolves to the path used.
 * `name` is the stem the debater typed; blank falls back to the suggestion so
 * a cleared field still creates a file. Collisions are deduped by the adapter.
 */
export async function createFlowFile(
    round: FlowRound,
    fs?: FlowFs,
    name?: string,
): Promise<string> {
    const io = fs ?? (await getFlowFs());
    const dir = await resolveFlowsDir(io);
    const text = serializeFlow(round);
    const stem = name?.trim();
    const path = await io.createFlow(dir, stem ? withEbbExt(stem) : suggestFilename(round), text);
    await noteOpened(path, io);
    void persistReplica(round, text);
    return path;
}

/**
 * Pick a flow to open. A `.ebb` is opened in place; anything else is treated as
 * a legacy export and materialized into the flows folder first, so the exports
 * users already have stay openable without becoming a second kind of document.
 * Resolves to the path to route to, or null when the picker was cancelled.
 */
export async function pickFlowToOpen(fs?: FlowFs): Promise<string | null> {
    const io = fs ?? (await getFlowFs());
    const picked = await io.pickOpenPath();
    if (!picked) return null;
    if (picked.toLowerCase().endsWith(EBB_EXT)) {
        await noteOpened(picked, io);
        return picked;
    }
    return importLegacyExport(picked, io);
}

/**
 * Turn a pre-.ebb JSON export into real flow files. A backup holding many
 * rounds becomes many files; the first is the one to open.
 */
async function importLegacyExport(path: string, io: FlowFs): Promise<string> {
    const snapshot = await io.readFlow(path);
    if (snapshot === null) throw new Error(`${basename(path)} no longer exists`);

    const rounds = parseLegacyExport(snapshot.text);
    if (!rounds.length) throw new Error(`${basename(path)} holds no flows`);

    const dir = await resolveFlowsDir(io);
    const written: string[] = [];
    for (const round of rounds) {
        written.push(await io.createFlow(dir, suggestFilename(round), serializeFlow(round)));
    }
    await noteOpened(written[0], io);
    return written[0];
}

/**
 * Save the open round to a location the user picks, and continue editing there.
 * Resolves to the new path, or null when the picker was cancelled.
 */
export async function saveFlowAs(round: FlowRound, fs?: FlowFs): Promise<string | null> {
    const io = fs ?? (await getFlowFs());
    const path = await io.pickSavePath(suggestFilename(round));
    if (!path) return null;
    const text = serializeFlow(round);
    // A path the user just chose is theirs to claim, so the write is forced.
    remember(path, await io.writeFlow(path, text, null));
    await noteOpened(path, io);
    void persistReplica(round, text);
    return path;
}

/**
 * Write immediately and report whether the flow file received the round.
 *
 * The boolean matters: a caller that is about to discard the round - closing
 * it, or quitting - must not treat a failed write as done, and one about to
 * hand the file to another app must not send a stale copy. A round that only
 * reached its recovery copy is not in the file, so it answers false. Backs the
 * manual retry affordance too.
 */
export async function saveFlowNow(
    path: string,
    round: FlowRound,
    onStatus?: (status: SaveStatus) => void,
): Promise<boolean> {
    return write(path, round, false, onStatus);
}

/**
 * Write over a flow that changed outside ebb, keeping the round in memory and
 * discarding whatever the other writer put there. Only reachable once the user
 * has been told about the conflict.
 */
export async function overwriteFlow(
    path: string,
    round: FlowRound,
    onStatus?: (status: SaveStatus) => void,
): Promise<boolean> {
    return write(path, round, true, onStatus);
}

async function write(
    path: string,
    round: FlowRound,
    force: boolean,
    onStatus?: (status: SaveStatus) => void,
): Promise<boolean> {
    onStatus?.("saving");
    const landed = await persist(path, round, force);
    onStatus?.(statusOf(landed));
    return landed === "file";
}

/** How far one save got. "swap" is the recovery copy without the file. */
type Landed = "file" | "swap" | "conflict" | "none";

function statusOf(landed: Landed): SaveStatus {
    if (landed === "file") return "saved";
    return landed === "conflict" ? "conflict" : "error";
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * The flow the debater chose to leave without saving. Saves still queued for
 * it, and any an unmount flushes afterwards, write nothing, so the recovery
 * copy that was dropped is not written straight back. Opening the flow again
 * lifts it.
 */
let abandoned: string | null = null;

/**
 * Leave the flow at `path` as its file last received it: drop the recovery
 * copy and stop writing it. Runs behind every save already queued.
 */
export function discardUnsaved(path: string): Promise<void> {
    abandoned = path;
    const job = queue.then(async () => {
        const io = await getFlowFs();
        await io.clearSwap(path);
    });
    queue = job.catch(() => undefined);
    return job.catch(() => undefined);
}

/**
 * Write the round to its recovery copy, then to the file, then drop the copy.
 *
 * Saves run one at a time, in the order they were asked for. The shell runs
 * file commands off its main thread, so two saves in flight could otherwise
 * land in either order and leave an older round on disk - and, here, an older
 * recovery copy than the round the file failed to receive. The stamp is read
 * when the save runs rather than when it was queued, so it is the one the
 * save before it left.
 */
function persist(path: string, round: FlowRound, force: boolean): Promise<Landed> {
    const job = queue.then(async (): Promise<Landed> => {
        if (path === abandoned) return "none";
        const io = await getFlowFs();
        const text = serializeFlow(round);
        const swapped = await io.writeSwap(path, text).then(
            () => true,
            () => false,
        );
        try {
            remember(path, await io.writeFlow(path, text, force ? null : stampFor(path)));
        } catch (err) {
            if (isConflict(err)) return "conflict";
            return swapped ? "swap" : "none";
        }
        // A copy that outlives this only matches the file, and a copy that
        // matches is not restored from.
        void io.clearSwap(path).catch(() => undefined);
        // Beside each save, and only once the flow itself landed: a sidecar
        // that outran the file it stamps would be discarded on the next open
        // anyway.
        void persistReplica(round, text);
        return "file";
    });
    // A save that throws outright reports nothing landed, and must not stall
    // every save queued behind it.
    const settled = job.catch((): Landed => "none");
    queue = settled;
    return settled;
}

// --- Autosave --------------------------------------------------------------------

export interface FlowAutosave {
    /**
     * Treat the store's current round as already on disk.
     *
     * Called right after a flow is loaded, and after Save As has written the
     * round to its new path. Without it the subscriber cannot tell a freshly
     * opened round from an edited one: guessing from the round id used to skip
     * the first edit after Save As entirely, because the new subscriber never
     * saw the load it was inferring from.
     */
    prime(): void;
    /** Stop listening, flushing anything still pending. */
    detach(): void;
}

/**
 * Subscribe to a store holding the open round and its path, and write on every
 * change, debounced. Only the newest write reports a terminal status, so a slow
 * earlier one cannot clobber a newer one's result.
 */
export function attachFlowAutosave(
    store: StoreApi<{ round: FlowRound | null; docPath: string | null }>,
    onStatus?: (status: SaveStatus) => void,
): FlowAutosave {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSeenId: string | null = null;
    let lastSeenUpdatedAt: number | null = null;
    let pending: { path: string; round: FlowRound } | null = null;
    let pendingSince = 0;
    let saveSeq = 0;

    function doSave(job: { path: string; round: FlowRound }) {
        const seq = ++saveSeq;
        onStatus?.("saving");
        void persist(job.path, job.round, false).then((landed) => {
            if (seq === saveSeq) onStatus?.(statusOf(landed));
        });
    }

    function flush() {
        clearTimeout(timer);
        timer = undefined;
        if (pending !== null) {
            const job = pending;
            pending = null;
            doSave(job);
        }
    }

    function prime() {
        const { round } = store.getState();
        lastSeenId = round?.id ?? null;
        lastSeenUpdatedAt = round?.updatedAt ?? null;
        // Anything queued before priming described the state we are declaring
        // already saved, so writing it would only rewrite identical bytes.
        pending = null;
        clearTimeout(timer);
        timer = undefined;
    }

    const unsubscribe = store.subscribe((state) => {
        const { round, docPath } = state;
        if (!round || !docPath) return;
        if (round.id === lastSeenId && round.updatedAt === lastSeenUpdatedAt) return;
        lastSeenId = round.id;
        lastSeenUpdatedAt = round.updatedAt;

        if (pending === null) pendingSince = Date.now();
        pending = { path: docPath, round };

        // A debounce that only ever resets never fires during a fast speech,
        // where edits land closer together than the window. The ceiling bounds
        // what a crash can cost to MAX_WAIT_MS rather than the whole burst.
        if (Date.now() - pendingSince >= MAX_WAIT_MS) {
            flush();
            return;
        }
        clearTimeout(timer);
        timer = setTimeout(flush, DEBOUNCE_MS);
    });

    return {
        prime,
        detach() {
            unsubscribe();
            flush();
        },
    };
}
