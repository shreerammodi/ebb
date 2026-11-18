import { beforeEach, describe, expect, it, vi } from "vitest";

import { hostPairing, PAIR_TTL_MS, redeemCode, type PairGuest } from "@/lib/collab/pairing";
import type { PeerLink } from "@/lib/collab/peerLink";
import { createMemoryNet, memoryPairId, memoryRelay } from "@/lib/collab/peerLinkMemory";

const net = createMemoryNet();
const ALEX = "a".repeat(64);
const SAM = "b".repeat(64);
const KIM = "d".repeat(64);
const CODE = "TESTAA01";
const TICKET = "ebb1:aGVsbG8";

/** Every delay armed, fired on demand rather than by a real timer. */
function clock() {
    const due: { fn: () => void; ms: number }[] = [];
    return {
        schedule(fn: () => void, ms: number) {
            const entry = { fn, ms };
            due.push(entry);
            return () => {
                const at = due.indexOf(entry);
                if (at >= 0) due.splice(at, 1);
            };
        },
        /** Fires everything armed for at most `ms`. */
        async fire(ms: number) {
            const ready = due.filter((d) => d.ms <= ms);
            for (const d of ready) due.splice(due.indexOf(d), 1);
            for (const d of ready) d.fn();
            await settle();
        },
        get armed() {
            return due.length;
        },
    };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

function link(id: string): Promise<PeerLink> {
    return net.create(id)({ discovery: "mdns", relay: true });
}

beforeEach(() => {
    net.reset();
});

describe("hostPairing", () => {
    it("puts the endpoint the code names on the air", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        expect(host.endpointId).toBe(memoryPairId(CODE));
        await host.stop();
    });

    it("hands a guest a ticket and learns where that guest is", async () => {
        const timer = clock();
        const guests: PairGuest[] = [];
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            displayName: "Alex",
            roundLabel: "Round 3",
            onGuest: (g) => guests.push(g),
            schedule: timer.schedule,
        });
        const paired = await redeemCode({
            port: await link(SAM),
            code: CODE,
            displayName: "Sam",
            schedule: timer.schedule,
        });
        expect(paired).toEqual({ ticket: TICKET, hostName: "Alex", roundLabel: "Round 3" });
        // Read off the connection, not from what the guest said about itself.
        expect(guests).toEqual([{ endpointId: SAM, name: "Sam", relayUrl: memoryRelay(SAM) }]);
        await host.stop();
    });

    it("spends a partner code on the first guest it answers", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule });
        await expect(
            redeemCode({ port: await link(KIM), code: CODE, schedule: timer.schedule }),
        ).rejects.toThrow();
        await host.stop();
    });

    it("answers the partner a code was spent on when their join has to start over", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule });
        await expect(
            redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule }),
        ).resolves.toMatchObject({ ticket: TICKET });
        // Still one person's code.
        await expect(
            redeemCode({ port: await link(KIM), code: CODE, schedule: timer.schedule }),
        ).rejects.toThrow();
        await host.stop();
    });

    it("lets a view-only code admit everyone who has it", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: false,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await expect(
            redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule }),
        ).resolves.toBeDefined();
        await expect(
            redeemCode({ port: await link(KIM), code: CODE, schedule: timer.schedule }),
        ).resolves.toBeDefined();
        await host.stop();
    });

    it("leaves the code alive when minting the ticket fails part way", async () => {
        const timer = clock();
        let fail = true;
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => {
                if (fail) throw new Error("no relay");
                return TICKET;
            },
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await expect(
            redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule }),
        ).rejects.toThrow();
        fail = false;
        // The same partner, trying again. A dial that failed part way must not
        // have burnt their one code.
        await expect(
            redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule }),
        ).resolves.toBeDefined();
        await host.stop();
    });

    it("dies of old age, and takes the endpoint with it", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await timer.fire(PAIR_TTL_MS);
        expect(net.calls.some((c) => c.op === "pairStop")).toBe(true);
        await expect(
            redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule }),
        ).rejects.toThrow();
        await host.stop();
    });

    it("stops once, however many times it is asked", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await host.stop();
        await host.stop();
        expect(net.calls.filter((c) => c.op === "pairStop")).toHaveLength(1);
    });

    it("leaves no timer armed after it stops", async () => {
        const timer = clock();
        const host = await hostPairing({
            port: await link(ALEX),
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        await host.stop();
        expect(timer.armed).toBe(0);
    });

    it("hangs up on a guest that dials and says nothing", async () => {
        const timer = clock();
        const port = await link(ALEX);
        const host = await hostPairing({
            port,
            code: CODE,
            once: true,
            mintTicket: async () => TICKET,
            onGuest: () => {},
            schedule: timer.schedule,
        });
        const conn = await (await link(SAM)).pairDial(CODE);
        let closed = false;
        conn.onClose(() => {
            closed = true;
        });
        await settle();
        // The hello deadline, which is the only thing bounding a dialler that
        // opened a connection and never spoke.
        await timer.fire(10_000);
        expect(closed).toBe(true);
        await host.stop();
    });
});

describe("redeemCode", () => {
    it("refuses a code nobody is holding", async () => {
        const timer = clock();
        await expect(
            redeemCode({ port: await link(SAM), code: CODE, schedule: timer.schedule }),
        ).rejects.toThrow();
    });

    it("gives up rather than waiting forever on a host that never answers", async () => {
        const timer = clock();
        // A host on the air that answers nothing, which is a version skew or a
        // half-open connection rather than a wrong code.
        await (await link(ALEX)).pairHost(CODE, () => {});
        const settled = vi.fn();
        void redeemCode({
            port: await link(SAM),
            code: CODE,
            schedule: timer.schedule,
        }).catch(settled);
        await settle();
        expect(settled).not.toHaveBeenCalled();
        await timer.fire(10_000);
        await settle();
        expect(settled).toHaveBeenCalled();
    });
});
