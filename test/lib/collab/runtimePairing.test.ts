import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PeerLink, PeerLinkConfig } from "@/lib/collab/peerLink";

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), {
        warning: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
    }),
}));

/** Filled in below, once the real transport module has been imported. */
const transport = vi.hoisted(() => ({
    link: null as ((config: PeerLinkConfig) => Promise<PeerLink>) | null,
}));

vi.mock("@/lib/collab/peerLink", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/collab/peerLink")>()),
    createPeerLinkFor: (config: PeerLinkConfig) => transport.link!(config),
}));

import { seedDoc } from "@/lib/collab/doc";
import { hostPairing } from "@/lib/collab/pairing";
import { createMemoryNet, memoryPairId, type MemoryNet } from "@/lib/collab/peerLinkMemory";
import { clearReplica } from "@/lib/collab/replica";
import { forgetRoundPeers, knownRoundRelays } from "@/lib/collab/roundPeers";
import { endSession, joinByCode, startPairing } from "@/lib/collab/runtime";
import { startCollabSession } from "@/lib/collab/session";
import { setSidecarFs } from "@/lib/collab/sidecarFs";
import { createSidecarFs } from "@/lib/collab/sidecarFsMemory";
import { encodeTicket } from "@/lib/collab/ticket";
import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { setFlowFs } from "@/lib/persistence/flowFs";
import { createFlowFs } from "@/lib/persistence/flowFsMemory";
import { useCollabStore } from "@/lib/store/useCollabStore";
import { useFlowStore } from "@/lib/store/useFlowStore";

const net: MemoryNet = createMemoryNet();
const ME = "e".repeat(64);
const SAM = "b".repeat(64);

let round: FlowRound;
/** The codes `pairHost` was asked for, and how many of them it refused. */
let tried: string[];
let refuse: number;

/**
 * The memory net, with `pairHost` refusing the first `refuse` codes. A relay
 * that will not answer is a property of the code that named it, so this is
 * exactly the shape of the failure a new code walks away from.
 */
function flaky(): (config: PeerLinkConfig) => Promise<PeerLink> {
    const base = net.create(ME);
    return async (config) => {
        const link = await base(config);
        return {
            ...link,
            async pairHost(code, onPeer) {
                tried.push(code);
                if (tried.length <= refuse) {
                    throw new Error("Could not reach the relay for that code");
                }
                return link.pairHost(code, onPeer);
            },
        };
    };
}

beforeEach(async () => {
    // startPairing asks collabLive(), so it needs a shell to be offered at
    // all. isDesktop() reads this global.
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    await endSession();
    net.reset();
    clearReplica();
    forgetRoundPeers();
    useCollabStore.getState().reset();
    tried = [];
    refuse = 0;
    transport.link = flaky();
    round = makeFlowRound({});
    useFlowStore.setState({
        collabEnabled: true,
        collabRelayEnabled: true,
        collabListenEnabled: false,
        contacts: {},
        round,
        docPath: "/flows/round-3-harvard.ebb",
    });
});

afterEach(async () => {
    await endSession();
});

describe("startPairing", () => {
    it("puts a code on the air for the open round", async () => {
        const hosted = await startPairing(round, "editor");
        expect(hosted?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
        expect(tried).toEqual([hosted!.code]);
        expect(net.calls.map((c) => c.op)).toContain("pairHost");
        await hosted!.stop();
    });

    it("throws away a code whose relay did not answer and mints another", async () => {
        refuse = 2;
        const hosted = await startPairing(round, "editor");
        // A new code is a new relay, which is the whole reason to retry rather
        // than tell the debater to click Share again.
        expect(tried).toHaveLength(3);
        expect(new Set(tried).size).toBe(3);
        expect(hosted!.code).toBe(tried[2]);
        await hosted!.stop();
    });

    it("gives up rather than minting codes forever", async () => {
        refuse = 99;
        await expect(startPairing(round, "editor")).rejects.toThrow(/relay/);
        expect(tried).toHaveLength(3);
    });

    it("stopping the code takes the endpoint off the air", async () => {
        const hosted = await startPairing(round, "editor");
        await hosted!.stop();
        expect(net.calls.some((c) => c.op === "pairStop")).toBe(true);
    });

    it("keeps where a guest was reached, so a later open has a route", async () => {
        const hosted = await startPairing(round, "editor");
        const guest = await net
            .create(SAM)({ discovery: "mdns", relay: true })
            .then((link) => link.pairDial(hosted!.code));
        guest.send({ type: "pairHello", name: "Sam" });
        for (let i = 0; i < 20; i++) await Promise.resolve();
        expect(knownRoundRelays(round.id)[SAM]).toBeTruthy();
        await hosted!.stop();
    });

    it("names the endpoint the code stands for", async () => {
        const hosted = await startPairing(round, "editor");
        // The memory net's stand-in for the shell's derivation: the point is
        // that both sides reach one name from one code.
        expect(memoryPairId(hosted!.code)).toBeTruthy();
        await hosted!.stop();
    });
});

describe("joinByCode", () => {
    afterEach(() => {
        setFlowFs(null);
        setSidecarFs(null);
    });

    it("dials the host from the endpoint that redeemed the code", async () => {
        setFlowFs(createFlowFs());
        setSidecarFs(createSidecarFs());
        const doc = seedDoc(round);
        const host = (await startCollabSession({
            createLink: net.create(SAM),
            roundId: round.id,
            appVersion: "0.11.0",
            doc: () => doc,
            apply: () => [],
        }))!;
        const hosted = await hostPairing({
            port: host.pairing(),
            code: "TESTAA01",
            once: true,
            mintTicket: async () => encodeTicket(await host.share("editor")),
            onGuest: () => {},
        });

        const joined = await joinByCode("TESTAA01");
        expect(joined?.hostEndpointId).toBe(SAM);
        // A stop before the dial is the endpoint closing between the code and
        // the ticket, which leaves the join to dial the host from a cold one.
        const dialled = net.calls.findIndex((c) => c.op === "dial" && c.endpointId === SAM);
        const released = net.calls.findIndex((c) => c.op === "stop" && c.endpointId === ME);
        expect(dialled).toBeGreaterThan(-1);
        expect(released).toBeGreaterThan(dialled);

        await hosted.stop();
        await host.stop();
    });
});

/**
 * The opt-in, on the two routes a pairing code opens. `optIn.test.ts` holds
 * the session itself under the same shape, and the positive control above is
 * what makes an empty recorder mean the gate held rather than that nothing
 * was asked.
 */
describe("with shared editing switched off", () => {
    beforeEach(() => {
        useFlowStore.setState({ collabEnabled: false });
    });

    it("mints no code and binds no pairing endpoint", async () => {
        expect(await startPairing(round, "editor")).toBeNull();
        expect(net.calls).toEqual([]);
    });

    it("redeems no code", async () => {
        expect(await joinByCode("TESTAA01")).toBeNull();
        expect(net.calls).toEqual([]);
    });
});
