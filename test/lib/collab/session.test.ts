import { beforeEach, describe, expect, it } from "vitest";

import { seedDoc } from "@/lib/collab/doc";
import { VERSION_SKEW } from "@/lib/collab/handshake";
import { merge } from "@/lib/collab/merge";
import {
    PROTOCOL_MAJOR,
    type PeerConn,
    type PeerLinkFactory,
    type WireMessage,
} from "@/lib/collab/peerLink";
import { HANDSHAKE_MS } from "@/lib/collab/peerLink";
import { createMemoryNet, memoryRelay, noPairing } from "@/lib/collab/peerLinkMemory";
import {
    forgetRoundPeers,
    knownRoundPeers,
    knownRoundRelays,
    setRoundPeers,
} from "@/lib/collab/roundPeers";
import {
    startCollabSession,
    type CollabPeer,
    type CollabSession,
    type SavedByPeer,
} from "@/lib/collab/session";
import { encodeTicket } from "@/lib/collab/ticket";
import type { CollabDoc } from "@/lib/collab/types";
import { modelCol } from "@/lib/grid/colSpace";
import { getPresences } from "@/lib/grid/presenceBridge";
import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

const net = createMemoryNet();

/** What iroh hands back. A ticket names the host, so the host holds a real one. */
const ALEX = "a".repeat(64);
const SAM = "b".repeat(64);
const STRANGER = "c".repeat(64);
const KIM = "d".repeat(64);

let shared: FlowRound;

/** A replica the session can read and write, with no grid behind it. */
function side(base: FlowRound) {
    let doc = seedDoc(base);
    return {
        doc: () => doc,
        apply: (incoming: CollabDoc) => {
            const result = merge(doc, incoming);
            doc = result.doc;
            return result.dropped;
        },
    };
}

function open(endpointId: string, over: Record<string, unknown> = {}) {
    return startCollabSession({
        createLink: net.create(endpointId),
        roundId: shared.id,
        appVersion: "0.11.0",
        ...side(shared),
        ...over,
    });
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Time the test owns, so a backoff or a deadline is a step rather than a wait. */
interface ManualClock {
    /** The scheduler a session runs on, valued by the call that cancels it. */
    schedule(fn: () => void, ms: number): () => void;
    /** Runs everything due by then, in one step. */
    advance(ms: number): void;
}

function manualClock(): ManualClock {
    let pending: { fn: () => void; at: number }[] = [];
    let now = 0;
    return {
        schedule(fn: () => void, ms: number) {
            const entry = { fn, at: now + ms };
            pending.push(entry);
            return () => {
                pending = pending.filter((p) => p !== entry);
            };
        },
        advance(ms: number) {
            now += ms;
            const due = pending.filter((p) => p.at <= now);
            pending = pending.filter((p) => p.at > now);
            for (const p of due) p.fn();
        },
    };
}

/** A link that hands back every connection it dials, so a test can cut one. */
function watched(endpointId: string, dialled: PeerConn[]): PeerLinkFactory {
    return async (config) => {
        const link = await net.create(endpointId)(config);
        return {
            ...link,
            async dial(target: string) {
                const conn = await link.dial(target);
                dialled.push(conn);
                return conn;
            },
        };
    };
}

/**
 * A guest admitted on a fresh ticket, over a connection the test drives by
 * hand. Every line the host puts on that connection is kept, so a test can ask
 * what the host said as well as what it recorded.
 */
async function admittedGuest(
    host: CollabSession,
    from: string,
): Promise<{ conn: PeerConn; heard: WireMessage[] }> {
    const secret = (await host.share("editor")).secret;
    const link = await net.create(from)({ discovery: "mdns", relay: true });
    const conn = await link.dial(ALEX);
    const heard: WireMessage[] = [];
    conn.onMessage((m) => heard.push(m));
    conn.send({
        type: "hello",
        protocol: PROTOCOL_MAJOR,
        app: "0.11.0",
        endpointId: from,
        roundId: shared.id,
        role: "editor",
        capabilities: [],
        ticket: secret,
    });
    await settle();
    return { conn, heard };
}

beforeEach(() => {
    net.reset();
    forgetRoundPeers();
    useFlowStore.setState({ collabEnabled: true, collabRelayEnabled: true });
    shared = makeFlowRound({});
});

describe("startCollabSession", () => {
    it("listens on the local endpoint", async () => {
        const session = await open(ALEX);
        expect(session!.endpointId).toBe(ALEX);
        expect(session!.roundId).toBe(shared.id);
        expect(net.calls.map((c) => c.op)).toContain("listen");
    });

    it("keeps running when a known peer cannot be reached", async () => {
        const session = await open(ALEX, { dial: ["gone"] });
        expect(session).not.toBeNull();
        expect(session!.peers()).toEqual([]);
    });

    it("re-dials a known peer with no ticket, which is what resume does", async () => {
        // The host already knows sam, the way a sidecar's peer list says it does.
        const host = await open(ALEX, { dial: ["sam"] });
        const guest = await open("sam", { dial: [ALEX] });
        await settle();
        expect(guest!.peers().map((p) => p.endpointId)).toEqual([ALEX]);
        expect(host!.peers().map((p) => p.endpointId)).toEqual(["sam"]);
    });

    it("reports the peer list as it changes", async () => {
        const seen: CollabPeer[][] = [];
        const host = await open(ALEX, {
            dial: ["sam"],
            onPeersChanged: (peers: CollabPeer[]) => seen.push(peers),
        });
        await open("sam", { dial: [ALEX] });
        await settle();
        expect(seen.at(-1)!.map((p) => p.endpointId)).toEqual(["sam"]);
        expect(host!.peers()).toHaveLength(1);
    });

    it("drops a peer from both lists when the link closes", async () => {
        const host = await open(ALEX, { dial: ["sam"] });
        const guest = await open("sam", { dial: [ALEX] });
        await settle();
        await guest!.stop();
        await settle();
        expect(host!.peers()).toEqual([]);
        expect(guest!.peers()).toEqual([]);
    });

    it("stops the link it started", async () => {
        const session = await open(ALEX);
        await session!.stop();
        expect(net.calls.map((c) => c.op)).toContain("stop");
    });

    it("mints a ticket that names this host and this round", async () => {
        const session = await open(ALEX);
        const ticket = await session!.share("editor");
        expect(ticket).toMatchObject({
            endpointId: ALEX,
            roundId: shared.id,
            role: "editor",
            relay: true,
        });
        expect(encodeTicket(ticket)).toContain("ebb1:");
    });

    it("mints a fresh ticket each time, replacing the unspent one", async () => {
        const session = await open(ALEX);
        expect((await session!.share("editor")).secret).not.toBe(
            (await session!.share("editor")).secret,
        );
    });

    it("carries the relay stance the settings hold into the ticket", async () => {
        useFlowStore.setState({ collabRelayEnabled: false });
        const session = await open(ALEX);
        expect((await session!.share("editor")).relay).toBe(false);
    });
});

describe("a link that drops mid-round", () => {
    // The dial that opened a link only retried while the session was coming
    // up, and only when a test handed it a scheduler. A wifi blip mid-round
    // left the peer gone for the rest of the round, and the debater's only way
    // back was to close the flow and open it again.
    it("dials the peer again, without anyone being asked", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            createLink: watched("sam", conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        expect(guest.peers()).toHaveLength(1);

        conns[0].close();
        await settle();
        expect(guest.peers()).toHaveLength(0);

        // The backoff comes round and the guest reaches the host again, with
        // no ticket and nothing on screen to answer.
        for (let i = 0; i < 6 && guest.peers().length === 0; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(guest.peers()).toHaveLength(1);
        expect(conns.length).toBeGreaterThan(1);

        await host.stop();
        await guest.stop();
    });

    it("stops trying once the session is over", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            createLink: watched("sam", conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();

        await guest.stop();
        const dialsAtStop = conns.length;
        for (let i = 0; i < 4; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(conns).toHaveLength(dialsAtStop);
        expect(guest.peers()).toHaveLength(0);

        await host.stop();
    });

    it("says it is reconnecting from the drop until the peer answers again", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            createLink: watched("sam", conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        expect(guest.reconnecting()).toBe(false);

        conns[0].close();
        await settle();
        expect(guest.reconnecting()).toBe(true);

        for (let i = 0; i < 6 && guest.peers().length === 0; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(guest.peers()).toHaveLength(1);
        expect(guest.reconnecting()).toBe(false);

        await host.stop();
        await guest.stop();
    });

    // A backoff is up to half a minute wide, so a session that ended while one
    // was armed would dial a peer long after the round was closed.
    it("cancels a backoff that outlived the session", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            createLink: watched("sam", conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        conns[0].close();
        await settle();
        expect(guest.reconnecting()).toBe(true);

        await guest.stop();
        expect(guest.reconnecting()).toBe(false);
        const dialsAtStop = conns.length;
        clock.advance(60_000);
        await settle();
        expect(conns).toHaveLength(dialsAtStop);

        await host.stop();
    });

    it("keeps a disconnected peer gone, however long the backoff runs", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            createLink: watched("sam", conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        expect(guest.peers()).toHaveLength(1);

        guest.disconnect(ALEX);
        await settle();
        expect(guest.peers()).toEqual([]);
        // The link really went, so the host is not left holding a peer that
        // walked away.
        expect(host.peers()).toEqual([]);
        expect(guest.reconnecting()).toBe(false);

        const dialsAtDisconnect = conns.length;
        for (let i = 0; i < 6; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(conns).toHaveLength(dialsAtDisconnect);
        expect(guest.peers()).toEqual([]);

        await host.stop();
        await guest.stop();
    });

    // The link dropped, the ladder is climbing, and the debater decides they
    // are done with that peer. Nothing about that is worth another dial.
    it("stops a backoff already climbing when the debater disconnects", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            createLink: watched("sam", conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        conns[0].close();
        await settle();
        expect(guest.reconnecting()).toBe(true);

        guest.disconnect(ALEX);
        expect(guest.reconnecting()).toBe(false);

        const dialsAtDisconnect = conns.length;
        for (let i = 0; i < 6; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(conns).toHaveLength(dialsAtDisconnect);
        expect(guest.peers()).toEqual([]);

        await host.stop();
        await guest.stop();
    });

    it("does not let a disconnected peer dial its way back in", async () => {
        const clock = manualClock();
        const host = (await open(ALEX))!;
        const guest = (await open("sam", {
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        expect(host.peers()).toHaveLength(1);

        host.disconnect("sam");
        await settle();
        expect(host.peers()).toEqual([]);

        // A known peer needs no ticket, which is exactly what makes the
        // disconnect worth enforcing on the way in.
        const again = (await open("sam", { dial: [ALEX], schedule: clock.schedule }))!;
        await settle();
        expect(host.peers()).toEqual([]);
        expect(again.peers()).toEqual([]);

        await host.stop();
        await guest.stop();
        await again.stop();
    });

    // The cut used to live in the session closure alone, while the round's own
    // peer list - which reaches the sidecar and comes back off it - only ever
    // grew. The next open dialled the peer again and admitted them on
    // membership, so Disconnect read as permanent and was a per-session mute.
    it("keeps a disconnected peer out of what the round remembers, so the cut survives the next open", async () => {
        const clock = manualClock();
        // What opening a round does before a session starts: the record exists
        // and is empty, because no sidecar for it does.
        setRoundPeers(shared.id, [], []);
        const host = (await open(ALEX, { schedule: clock.schedule }))!;
        const guest = (await open("sam", {
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        expect(host.peers()).toHaveLength(1);
        expect(knownRoundPeers(shared.id)).toEqual(["sam"]);

        host.disconnect("sam");
        await settle();
        expect(knownRoundPeers(shared.id)).toEqual([]);
        await host.stop();
        await guest.stop();

        // What the next open is: a fresh session dialling and admitting off the
        // round's record. Nothing there names the peer, and they hold no
        // ticket, so the refusal is silent on both paths.
        const reopened = (await open(ALEX, {
            dial: knownRoundPeers(shared.id),
            schedule: clock.schedule,
        }))!;
        const back = (await open("sam", { dial: [ALEX], schedule: clock.schedule }))!;
        await settle();
        expect(net.calls.filter((c) => c.op === "dial" && c.endpointId === "sam")).toEqual([]);
        expect(reopened.peers()).toEqual([]);
        expect(back.peers()).toEqual([]);

        await reopened.stop();
        await back.stop();
    });

    // Resume is symmetric, so both sides reach out. Two connections landing in
    // one slot left whichever lost the map entry open, unreachable, unclosed,
    // and still counted as a peer by the far side.
    it("keeps one connection when both sides reach each other at once", async () => {
        const hostConns: PeerConn[] = [];
        const guestConns: PeerConn[] = [];
        const host = (await open(ALEX, { createLink: watched(ALEX, hostConns) }))!;
        const guest = (await open("sam", {
            createLink: watched("sam", guestConns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
        }))!;
        await settle();
        expect(host.peers()).toHaveLength(1);
        expect(guestConns).toHaveLength(1);

        let cut = 0;
        guestConns[0].onClose(() => cut++);

        // The host reaches for a guest it is already holding, which is what a
        // contact invited onto a round they have just joined looks like.
        await host.invite("sam", "editor");
        await settle();
        expect(hostConns).toHaveLength(1);

        expect(host.peers().map((p) => p.endpointId)).toEqual(["sam"]);
        expect(guest.peers().map((p) => p.endpointId)).toEqual([ALEX]);
        // Both ends dropped the same one, so the guest's own dial is closed
        // and the peer is still there on the connection that survived.
        expect(cut).toBe(1);

        // And it is the same connection on both sides: the guest leaving is
        // something the host hears about.
        await guest.stop();
        await settle();
        expect(host.peers()).toEqual([]);
        await host.stop();
    });
});

describe("what a dialler is told", () => {
    function hello(over: Partial<Extract<WireMessage, { type: "hello" }>> = {}): WireMessage {
        return {
            type: "hello",
            protocol: PROTOCOL_MAJOR,
            app: "0.11.0",
            endpointId: STRANGER,
            roundId: shared.id,
            role: "editor",
            capabilities: [],
            ...over,
        };
    }

    /** Dials the host by hand, so a test sees exactly what comes back. */
    async function knock(from: string, msg: WireMessage) {
        const link = await net.create(from)({ discovery: "mdns", relay: true });
        const conn = await link.dial(ALEX);
        const answers: WireMessage[] = [];
        let closed = false;
        conn.onMessage((m) => answers.push(m));
        conn.onClose(() => {
            closed = true;
        });
        conn.send(msg);
        await settle();
        return { conn, answers, closed };
    }

    // An EndpointId is permanent and every peer who ever shared with this
    // install holds one, so a stranger who dials learns that something closed
    // and nothing else at all.
    it("puts nothing on the wire for a refusal it is not meant to see", async () => {
        await open(ALEX);
        const { answers, closed } = await knock(STRANGER, hello());
        expect(answers).toEqual([]);
        expect(closed).toBe(true);
    });

    it("tells a stranger on another version nothing about this one", async () => {
        await open(ALEX);
        const { answers } = await knock(STRANGER, hello({ protocol: PROTOCOL_MAJOR + 1 }));
        expect(answers).toEqual([]);
    });

    it("names a skew to a caller holding the ticket, without naming a version", async () => {
        const host = (await open(ALEX))!;
        const ticket = await host.share("editor");
        const { answers } = await knock(
            SAM,
            hello({ endpointId: SAM, protocol: PROTOCOL_MAJOR + 1, ticket: ticket.secret }),
        );
        expect(answers).toEqual([{ type: "helloAck", ok: false, reason: VERSION_SKEW }]);
        expect(JSON.stringify(answers)).not.toContain("0.11.0");
    });

    // The refusing side wrote that string, and it lands on this side's screen.
    it("never repeats the words a refusing host chose", async () => {
        const link = await net.create(ALEX)({ discovery: "mdns", relay: true });
        await link.listen((conn) => {
            conn.onMessage(() => {
                conn.send({
                    type: "helloAck",
                    ok: false,
                    reason: "ebb says: your flow is corrupt, call 555-0100 to recover it",
                });
                conn.close();
            });
        });

        const guest = (await open(SAM))!;
        const err = await guest.invite(ALEX, "editor").then(
            () => null,
            (e: unknown) => e as Error,
        );
        expect(err!.message).toBe("That peer refused the connection");
        expect(err!.message).not.toContain("555");
    });
});

describe("a dialler that never greets", () => {
    /** Opens a connection to the host and says nothing at all on it. */
    async function silent(from: string) {
        const link = await net.create(from)({ discovery: "mdns", relay: true });
        const conn = await link.dial(ALEX);
        const state = { closed: false };
        conn.onClose(() => {
            state.closed = true;
        });
        return state;
    }

    // Every refusal in the admission path is inside the greeting handler, so a
    // connection that never enters it was never refused and never closed. A
    // stranger who knows the EndpointId could hold one slot per dial, for the
    // whole round, with nothing on the debater's screen to say so.
    it("is closed once the deadline passes", async () => {
        const clock = manualClock();
        const host = (await open(ALEX, { schedule: clock.schedule }))!;
        const stranger = await silent(STRANGER);
        await settle();
        expect(stranger.closed).toBe(false);

        clock.advance(HANDSHAKE_MS);
        await settle();
        expect(stranger.closed).toBe(true);
        // Nothing was admitted, so nothing was on the peer list to lose.
        expect(host.peers()).toEqual([]);

        await host.stop();
    });

    it("does not take an admitted peer with it when the deadline comes round", async () => {
        const clock = manualClock();
        const host = (await open(ALEX, { schedule: clock.schedule }))!;
        const guest = (await open(SAM, {
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        expect(host.peers()).toHaveLength(1);

        clock.advance(HANDSHAKE_MS * 2);
        await settle();
        expect(host.peers()).toHaveLength(1);
        expect(guest.peers()).toHaveLength(1);

        await host.stop();
        await guest.stop();
    });
});

describe("a peer's claim on a cell", () => {
    // The cell goes straight into the presence table, where a row nobody can
    // hold would sit unmatched for the rest of the round.
    it("ignores a cell that is not one", async () => {
        const host = (await open(ALEX))!;
        const { conn } = await admittedGuest(host, SAM);
        expect(host.peers()).toHaveLength(1);
        expect(getPresences()).toEqual([]);

        for (const cell of [
            { sheetId: "sheet_1", col: -1, row: 0 },
            { sheetId: "sheet_1", col: 0, row: 1.5 },
            { sheetId: 7, col: 0, row: 0 },
            { sheetId: "sheet_1", col: "0", row: 0 },
            { sheetId: "sheet_1", row: 0 },
            "sheet_1",
        ]) {
            conn.send({ type: "presence", cell } as WireMessage);
            conn.send({ type: "cursor", cell } as WireMessage);
            await settle();
            expect(getPresences()).toEqual([]);
        }

        conn.send({ type: "presence", cell: { sheetId: "sheet_1", col: modelCol(1), row: 2 } });
        await settle();
        expect(getPresences()).toEqual([
            {
                endpointId: SAM,
                sheetId: "sheet_1",
                col: 1,
                row: 2,
                heldAt: expect.any(Number),
                editing: true,
                readOnly: false,
            },
        ]);
        await host.stop();
    });

    // A cursor is not a claim. Painting it is the point; refusing a keystroke
    // on it would make a partner reading over your shoulder cost you a cell.
    it("records a resting cursor without claiming the cell", async () => {
        const host = (await open(ALEX))!;
        const { conn } = await admittedGuest(host, SAM);

        conn.send({ type: "cursor", cell: { sheetId: "sheet_1", col: modelCol(1), row: 2 } });
        await settle();
        expect(getPresences()).toEqual([
            {
                endpointId: SAM,
                sheetId: "sheet_1",
                col: 1,
                row: 2,
                heldAt: expect.any(Number),
                editing: false,
                readOnly: false,
            },
        ]);

        // One entry per peer either way round: a cursor that started editing
        // is the same peer in the same place, not a second mark.
        conn.send({ type: "presence", cell: { sheetId: "sheet_1", col: modelCol(1), row: 2 } });
        await settle();
        expect(getPresences()).toHaveLength(1);
        expect(getPresences()[0].editing).toBe(true);

        conn.send({ type: "cursor", cell: null });
        await settle();
        expect(getPresences()).toEqual([]);
        await host.stop();
    });
});

/**
 * A QUIC close says nothing about why, so a window that shut down on purpose
 * and a wifi blip that is about to come back look identical on the wire. A
 * peer that is leaving says so, and the side that hears it lets go rather than
 * spending the rest of the round dialling a window nobody is behind.
 */
describe("a peer that says it is leaving", () => {
    /** Every dial this net was asked to make at the host, answered or not. */
    const dialsToHost = (): number =>
        net.calls.filter((c) => c.op === "dial" && c.endpointId === ALEX).length;

    /** A guest holding the host over a connection the test can cut by hand. */
    async function guestOf(
        clock: ManualClock,
        conns: PeerConn[],
    ): Promise<{ host: CollabSession; guest: CollabSession }> {
        const host = (await open(ALEX, { schedule: clock.schedule }))!;
        const guest = (await open(SAM, {
            createLink: watched(SAM, conns),
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            schedule: clock.schedule,
        }))!;
        await settle();
        return { host, guest };
    }

    it("is off the far side's peer list at once, holding nothing", async () => {
        const host = (await open(ALEX))!;
        const { conn } = await admittedGuest(host, SAM);
        conn.send({ type: "presence", cell: { sheetId: "sheet_1", col: modelCol(1), row: 2 } });
        await settle();
        expect(host.peers()).toHaveLength(1);
        expect(getPresences()).toHaveLength(1);

        conn.send({ type: "bye" });
        await settle();
        expect(host.peers()).toEqual([]);
        // Nothing waits for the heartbeat to lapse: the cell they were on is
        // free the moment they say they are gone.
        expect(getPresences()).toEqual([]);

        await host.stop();
    });

    it("is not dialled again by the side that dialled it", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const { host, guest } = await guestOf(clock, conns);
        expect(guest.peers()).toHaveLength(1);

        // The host closing its round is what puts a bye on the guest's wire,
        // and the guest is the side that dialled, so it is the side that would
        // otherwise arm a ladder.
        await host.stop();
        await settle();
        expect(guest.peers()).toEqual([]);
        expect(guest.reconnecting()).toBe(false);

        const before = dialsToHost();
        for (let i = 0; i < 6; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(dialsToHost()).toBe(before);
        expect(guest.peers()).toEqual([]);

        await guest.stop();
    });

    // The control the claim above rests on. Without it the same assertion
    // passes on a session that never dials anybody again for any reason.
    it("is dialled again when the link merely drops, with nothing said", async () => {
        const clock = manualClock();
        const conns: PeerConn[] = [];
        const { host, guest } = await guestOf(clock, conns);

        conns[0].close();
        await settle();
        expect(guest.peers()).toEqual([]);
        expect(guest.reconnecting()).toBe(true);

        const before = dialsToHost();
        for (let i = 0; i < 6 && guest.peers().length === 0; i++) {
            clock.advance(60_000);
            await settle();
        }
        expect(guest.peers()).toHaveLength(1);
        expect(dialsToHost()).toBeGreaterThan(before);

        await host.stop();
        await guest.stop();
    });

    // Sent before the close, which is the only order that works: the far side
    // hears nothing at all over a connection that is already down.
    it("hears one from a session that is stopping, on every live connection", async () => {
        const host = (await open(ALEX))!;
        const sam = await admittedGuest(host, SAM);
        const kim = await admittedGuest(host, KIM);
        expect(host.peers()).toHaveLength(2);

        await host.stop();
        await settle();
        expect(sam.heard.at(-1)).toEqual({ type: "bye" });
        expect(kim.heard.at(-1)).toEqual({ type: "bye" });
    });
});

/**
 * Saving a peer only works in both directions. An EndpointId names somebody
 * and does not route to them, so a contact one side holds and the other does
 * not is dialable one way: the side that saves says so, and the far side saves
 * it back off the link it is already holding.
 */
describe("telling a peer it has been saved", () => {
    it("says so to that peer and to nobody else", async () => {
        const host = (await open(ALEX, { displayName: "Alex" }))!;
        const sam = await admittedGuest(host, SAM);
        const kim = await admittedGuest(host, KIM);

        host.announceContact(SAM);
        await settle();
        expect(sam.heard.at(-1)).toEqual({ type: "contact", name: "Alex" });
        expect(kim.heard.map((m) => m.type)).not.toContain("contact");

        await host.stop();
    });

    it("says nothing at all for an endpoint the session is not holding", async () => {
        const host = (await open(ALEX, { displayName: "Alex" }))!;
        const sam = await admittedGuest(host, SAM);
        const said = sam.heard.length;

        host.announceContact(STRANGER);
        await settle();
        expect(sam.heard).toHaveLength(said);
        expect(host.peers()).toHaveLength(1);

        await host.stop();
    });

    it("reaches the far side with the name and the relay the link reported", async () => {
        const saved: SavedByPeer[] = [];
        const host = (await open(ALEX, { displayName: "Alex" }))!;
        const guest = (await open(SAM, {
            ticket: encodeTicket(await host.share("editor")),
            dial: [ALEX],
            onContact: (peer: SavedByPeer) => saved.push(peer),
        }))!;
        await settle();

        host.announceContact(SAM);
        await settle();
        // The relay is what makes the contact saved from this dialable from
        // another network, and the link is the only thing that knows it.
        expect(saved).toEqual([{ endpointId: ALEX, name: "Alex", relayUrl: memoryRelay(ALEX) }]);

        await host.stop();
        await guest.stop();
    });

    // The message carries no endpoint of its own, and a sender that puts one
    // there is naming somebody else's contact row to write into.
    it("files the sender under the endpoint the transport proved", async () => {
        const saved: SavedByPeer[] = [];
        const host = (await open(ALEX, {
            onContact: (peer: SavedByPeer) => saved.push(peer),
        }))!;
        const { conn } = await admittedGuest(host, SAM);

        conn.send({ type: "contact", name: "Rae", endpointId: STRANGER } as WireMessage);
        await settle();
        expect(saved).toEqual([{ endpointId: SAM, name: "Rae", relayUrl: memoryRelay(SAM) }]);

        await host.stop();
    });

    /**
     * What a link observes about a dialler is the relay its packets came in
     * through. A guest that dialled the host's relay is reported at the
     * host's relay, which is nowhere to find that guest once it hangs up, so
     * the guest says where it is homed and that is what the round keeps.
     */
    it("keeps the relay a guest names over the one the link observed", async () => {
        const saved: SavedByPeer[] = [];
        const host = (await open(ALEX, {
            onContact: (peer: SavedByPeer) => saved.push(peer),
        }))!;
        const secret = (await host.share("editor")).secret;
        const link = await net.create(SAM)({ discovery: "mdns", relay: true });
        const conn = await link.dial(ALEX);
        const home = "https://relay.invalid/where-sam-lives";
        conn.send({
            type: "hello",
            protocol: PROTOCOL_MAJOR,
            app: "0.11.0",
            endpointId: SAM,
            roundId: shared.id,
            role: "editor",
            capabilities: [],
            ticket: secret,
            relayUrl: home,
        });
        await settle();

        expect(host.peers().map((p) => p.relayUrl)).toEqual([home]);
        expect(knownRoundRelays(shared.id)).toEqual({ [SAM]: home });
        conn.send({ type: "contact", name: "Sam" });
        await settle();
        expect(saved).toEqual([{ endpointId: SAM, name: "Sam", relayUrl: home }]);

        await host.stop();
    });

    it("says where it is homed in the hello it dials with", async () => {
        const heard: WireMessage[] = [];
        const link = await net.create(ALEX)({ discovery: "mdns", relay: true });
        await link.listen((conn) =>
            conn.onMessage((m) => {
                heard.push(m);
                conn.send({ type: "helloAck", ok: true });
            }),
        );
        const guest = (await open(SAM, { dial: [ALEX] }))!;
        await settle();
        expect(heard[0]).toMatchObject({ type: "hello", relayUrl: memoryRelay(SAM) });

        await guest.stop();
        await link.stop();
    });
});

/**
 * Every window hears every accepted connection, because the round it belongs
 * to arrives in the hello and the shell reads no further than the bytes. So
 * an accepted connection is nobody's until a window says the peer is theirs,
 * and admitting them is the one thing that says it. Writing is not: a window
 * with a different flow open answers the same hello with a refusal, and
 * latching on that write left the refusing window holding a guest it then hung
 * up on, with the host's own ack refused as another window's.
 */
describe("what admitting a peer tells the shell", () => {
    /** The memory transport with the shell's claim on it, which only the
     *  desktop adapter has. */
    function claiming(endpointId: string, claimed: string[]): PeerLinkFactory {
        return async (config) => {
            const link = await net.create(endpointId)(config);
            return {
                ...link,
                async listen(onPeer: (conn: PeerConn) => void) {
                    await link.listen((conn) =>
                        onPeer({ ...conn, claim: () => claimed.push(conn.id) }),
                    );
                },
            };
        };
    }

    /** Dials the host with a hello and lets the handshake run out. */
    async function greet(from: string, msg: WireMessage): Promise<void> {
        const link = await net.create(from)({ discovery: "mdns", relay: true });
        const conn = await link.dial(ALEX);
        conn.send(msg);
        await settle();
    }

    it("claims the connection of a peer it lets in", async () => {
        const claimed: string[] = [];
        const host = (await open(ALEX, { createLink: claiming(ALEX, claimed) }))!;
        const secret = (await host.share("editor")).secret;

        await greet(SAM, {
            type: "hello",
            protocol: PROTOCOL_MAJOR,
            app: "0.11.0",
            endpointId: SAM,
            roundId: shared.id,
            role: "editor",
            capabilities: [],
            ticket: secret,
        });

        expect(host.peers()).toHaveLength(1);
        expect(claimed).toEqual([SAM]);
    });

    it("claims nothing from a peer it refuses", async () => {
        const claimed: string[] = [];
        const host = (await open(ALEX, { createLink: claiming(ALEX, claimed) }))!;

        await greet(STRANGER, {
            type: "hello",
            protocol: PROTOCOL_MAJOR,
            app: "0.11.0",
            endpointId: STRANGER,
            roundId: shared.id,
            role: "editor",
            capabilities: [],
        });

        expect(host.peers()).toEqual([]);
        expect(claimed).toEqual([]);
    });
});

/**
 * A dial that never lands costs its whole deadline, which is ten seconds and
 * more on a real transport. Awaiting them one after another means a round that
 * remembers three absent partners takes three of those to open, with the
 * debater watching a session that does not exist yet.
 */
describe("a round that remembers several peers", () => {
    it("dials them all at once rather than one after another", async () => {
        const started: string[] = [];
        let release = (): void => {};
        const held = new Promise<void>((resolve) => (release = resolve));

        const slow: PeerLinkFactory = async () => ({
            ...noPairing,
            async endpointId() {
                return ALEX;
            },
            async relayUrl() {
                return "";
            },
            async listen() {},
            async dial(target: string) {
                started.push(target);
                await held;
                throw new Error("that peer did not answer");
            },
            async stop() {},
        });

        const opening = open(ALEX, { createLink: slow, dial: [SAM, STRANGER, "kim"] });
        await settle();
        expect(started).toEqual([SAM, STRANGER, "kim"]);

        // And the session still waits for all of them, so a caller that dialled
        // a contact on the way up has its answer by the time it returns.
        release();
        expect(await opening).not.toBeNull();
    });

    /**
     * Contacting a relay is a round trip to whichever server is nearest, and
     * the answer is only ever needed by a ticket. Holding the session behind
     * it would delay every dial that puts a reopened round's partners back,
     * for a question nobody has asked yet.
     */
    it("comes up and dials while the relay is still being found", async () => {
        const dialled: string[] = [];
        let answer = (_url: string): void => {};
        const pending = new Promise<string>((resolve) => (answer = resolve));

        const late: PeerLinkFactory = async () => ({
            ...noPairing,
            async endpointId() {
                return ALEX;
            },
            relayUrl: () => pending,
            async listen() {},
            async dial(target: string) {
                dialled.push(target);
                throw new Error("that peer did not answer");
            },
            async stop() {},
        });

        const session = (await open(ALEX, { createLink: late, dial: [SAM] }))!;
        expect(session).not.toBeNull();
        expect(dialled).toEqual([SAM]);

        // The ticket is the one thing that waits, because it is the one thing
        // that carries the answer.
        const minted = session.share("editor");
        answer("https://usw1-1.relay.n0.iroh.link./");
        expect((await minted).relayUrl).toBe("https://usw1-1.relay.n0.iroh.link./");
    });
});
