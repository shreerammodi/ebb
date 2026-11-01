import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand";

import { makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { FLOW_FILE_VERSION, parseFlowFile, serializeFlow } from "@/lib/persistence/flowFile";
import {
    attachFlowAutosave,
    createFlowFile,
    discardUnsaved,
    pickFlowToOpen,
    readFlowAt,
    saveFlowAs,
    overwriteFlow,
    saveFlowNow,
} from "@/lib/persistence/flowSession";
import { loadRecents } from "@/lib/persistence/recents";

import { FLOWS_DIR, installFakeFlowFs, type FakeFlowFs } from "../../support/fakeFlowFs";

let fs: FakeFlowFs;

beforeEach(() => {
    fs = installFakeFlowFs();
});

describe("createFlowFile", () => {
    it("writes the flow into the flows folder and remembers it", async () => {
        const round = makeFlowRound({ event: "policy" });
        const path = await createFlowFile(round, fs);

        expect(path.startsWith(FLOWS_DIR + "/")).toBe(true);
        expect(parseFlowFile(fs.files.get(path)!).id).toBe(round.id);
        expect((await loadRecents(fs)).map((r) => r.path)).toEqual([path]);
    });

    it("never overwrites an existing flow", async () => {
        const createdAt = new Date(2026, 6, 25).getTime();
        const first = await createFlowFile({ ...makeFlowRound({}), createdAt }, fs);
        const second = await createFlowFile({ ...makeFlowRound({}), createdAt }, fs);

        expect(second).not.toBe(first);
        expect(fs.files.size).toBeGreaterThanOrEqual(2);
    });

    it("files the flow under the name the debater typed", async () => {
        const path = await createFlowFile(makeFlowRound({}), fs, " Round 3 ");
        expect(path).toBe(`${FLOWS_DIR}/Round 3.ebb`);
    });

    it("falls back to the suggested name when the typed one is blank", async () => {
        const path = await createFlowFile(makeFlowRound({ event: "ld" }), fs, "  ");
        expect(path).toMatch(/\/ld-\d{4}-\d{2}-\d{2}\.ebb$/);
    });
});

describe("readFlowAt", () => {
    it("returns null for a file that is gone, which is an ordinary outcome", async () => {
        expect(await readFlowAt("/nowhere.ebb", fs)).toBeNull();
    });

    it("throws for a file that exists but will not parse", async () => {
        fs.files.set("/a.ebb", "{ truncated");
        await expect(readFlowAt("/a.ebb", fs)).rejects.toThrow(/not valid JSON/);
    });
});

describe("pickFlowToOpen", () => {
    it("returns null when the picker is cancelled", async () => {
        fs.nextOpen = null;
        expect(await pickFlowToOpen(fs)).toBeNull();
    });

    it("opens a .ebb in place and records it", async () => {
        const round = makeFlowRound({});
        fs.files.set("/elsewhere/r.ebb", serializeFlow(round));
        fs.nextOpen = "/elsewhere/r.ebb";

        expect(await pickFlowToOpen(fs)).toBe("/elsewhere/r.ebb");
        expect((await loadRecents(fs)).map((r) => r.path)).toEqual(["/elsewhere/r.ebb"]);
        // Opening must not copy the file into the flows folder.
        expect([...fs.files.keys()]).not.toContainEqual(expect.stringContaining(FLOWS_DIR));
    });

    it("materializes a legacy backup into one file per round", async () => {
        const rounds = [makeFlowRound({ event: "policy" }), makeFlowRound({ event: "ld" })];
        fs.files.set(
            "/downloads/backup.json",
            JSON.stringify({ version: FLOW_FILE_VERSION, kind: "backup", rounds }),
        );
        fs.nextOpen = "/downloads/backup.json";

        const opened = await pickFlowToOpen(fs);
        const written = [...fs.files.keys()].filter((p) => p.startsWith(FLOWS_DIR));

        expect(written).toHaveLength(2);
        expect(opened).toBe(written[0]);
        expect(parseFlowFile(fs.files.get(opened!)!).event).toBe("policy");
    });
});

describe("saveFlowAs", () => {
    it("writes to the picked path and remembers it", async () => {
        const round = makeFlowRound({});
        fs.nextSave = "/elsewhere/copy.ebb";

        expect(await saveFlowAs(round, fs)).toBe("/elsewhere/copy.ebb");
        expect(parseFlowFile(fs.files.get("/elsewhere/copy.ebb")!).id).toBe(round.id);
        expect((await loadRecents(fs)).map((r) => r.path)).toEqual(["/elsewhere/copy.ebb"]);
    });

    it("writes nothing when cancelled", async () => {
        fs.nextSave = null;
        expect(await saveFlowAs(makeFlowRound({}), fs)).toBeNull();
        expect(fs.writes).toEqual([]);
    });
});

describe("overwriteFlow", () => {
    it("forces past a conflict so the user's round wins", async () => {
        const round = makeFlowRound({});
        fs.files.set("/a.ebb", serializeFlow(round));
        // Opening records the version ebb saw; without that baseline there is
        // nothing to detect a change against.
        await readFlowAt("/a.ebb", fs);
        fs.conflictOn = "/a.ebb";

        // Guarded writes are refused...
        expect(await saveFlowNow("/a.ebb", round)).toBe(false);
        // ...but the explicit "keep mine" is not.
        expect(await overwriteFlow("/a.ebb", round)).toBe(true);
        expect(parseFlowFile(fs.files.get("/a.ebb")!).id).toBe(round.id);
    });
});

describe("saveFlowNow", () => {
    it("reports saving then saved", async () => {
        const status = vi.fn();
        await saveFlowNow("/a.ebb", makeFlowRound({}), status);
        expect(status.mock.calls.flat()).toEqual(["saving", "saved"]);
    });

    it("reports an error instead of throwing at the caller", async () => {
        const status = vi.fn();
        fs.failWrites = "disk full";
        await saveFlowNow("/a.ebb", makeFlowRound({}), status);
        expect(status.mock.calls.flat()).toEqual(["saving", "error"]);
    });

    it("answers whether the flow actually reached disk", async () => {
        // Anything about to discard the round depends on this boolean.
        expect(await saveFlowNow("/a.ebb", makeFlowRound({}))).toBe(true);
        fs.failWrites = "disk full";
        expect(await saveFlowNow("/a.ebb", makeFlowRound({}))).toBe(false);
    });
});

describe("the recovery copy", () => {
    it("keeps a round the flows folder refused, without calling it saved", async () => {
        const round = makeFlowRound({});
        const status = vi.fn();
        fs.failFlowWrites = "access denied";

        expect(await saveFlowNow("/a.ebb", round, status)).toBe(false);
        // The file was not written, and the header still says so.
        expect(status.mock.calls.flat()).toEqual(["saving", "error"]);
        expect(parseFlowFile(fs.swaps.get("/a.ebb")!).id).toBe(round.id);
    });

    it("is dropped once the file itself lands", async () => {
        await saveFlowNow("/a.ebb", makeFlowRound({}));
        expect(fs.swaps.has("/a.ebb")).toBe(false);
    });

    it("never makes a conflict safe to leave", async () => {
        const round = makeFlowRound({});
        fs.files.set("/a.ebb", serializeFlow(round));
        await readFlowAt("/a.ebb", fs);
        fs.conflictOn = "/a.ebb";
        expect(await saveFlowNow("/a.ebb", round)).toBe(false);
    });

    it("stays dropped after the debater leaves without saving", async () => {
        fs.failFlowWrites = "access denied";
        await saveFlowNow("/a.ebb", makeFlowRound({}));
        await discardUnsaved("/a.ebb");
        // A flush on the way out must not write it straight back.
        await saveFlowNow("/a.ebb", makeFlowRound({}));
        expect(fs.swaps.has("/a.ebb")).toBe(false);
    });

    it("is restored on open when the file never received it", async () => {
        const old = makeFlowRound({});
        const newer = { ...old, updatedAt: old.updatedAt + 1, title: "newer" };
        fs.files.set("/a.ebb", serializeFlow(old));
        fs.swaps.set("/a.ebb", serializeFlow(newer));

        const opened = await readFlowAt("/a.ebb", fs);
        expect(opened?.recovered).toBe(true);
        expect(opened?.round.updatedAt).toBe(newer.updatedAt);
    });

    it("is passed over when it matches the file or was torn mid-write", async () => {
        const round = makeFlowRound({});
        fs.files.set("/a.ebb", serializeFlow(round));

        fs.swaps.set("/a.ebb", serializeFlow(round));
        expect((await readFlowAt("/a.ebb", fs))?.recovered).toBe(false);

        fs.swaps.set("/a.ebb", "{ torn");
        expect((await readFlowAt("/a.ebb", fs))?.recovered).toBe(false);
    });
});

describe("attachFlowAutosave", () => {
    interface DocState {
        round: FlowRound | null;
        docPath: string | null;
    }

    /**
     * Mirrors AppRoot: attach, put the round in the store, then prime, because
     * the round just came off disk. Priming is what tells autosave the current
     * state is already saved - it never infers that.
     */
    function openIn(round: FlowRound, docPath = "/a.ebb") {
        const s = createStore<DocState>()(() => ({ round: null, docPath: null }));
        const autosave = attachFlowAutosave(s);
        s.setState({ round, docPath });
        autosave.prime();
        return { store: s, stop: () => autosave.detach(), autosave };
    }

    beforeEach(() => vi.useFakeTimers());

    it("does not rewrite a flow just because it was opened", async () => {
        const { stop } = openIn(makeFlowRound({}));
        await vi.advanceTimersByTimeAsync(600);

        expect(fs.writes).toEqual([]);
        stop();
    });

    it("debounces a burst of edits into one write", async () => {
        const round = makeFlowRound({});
        const { store: s, stop } = openIn(round);

        for (let i = 1; i <= 5; i++) {
            s.setState({ round: { ...round, updatedAt: round.updatedAt + i } });
        }
        expect(fs.writes).toEqual([]);

        await vi.advanceTimersByTimeAsync(600);
        expect(fs.writes).toEqual(["/a.ebb"]);
        expect(parseFlowFile(fs.files.get("/a.ebb")!).updatedAt).toBe(round.updatedAt + 5);
        stop();
    });

    it("flushes on teardown, so navigating away never drops the last edit", async () => {
        const round = makeFlowRound({});
        const { store: s, stop } = openIn(round);

        s.setState({ round: { ...round, updatedAt: round.updatedAt + 1 } });
        stop();
        await vi.advanceTimersByTimeAsync(0);

        expect(fs.writes).toEqual(["/a.ebb"]);
    });

    it("ignores a store change that did not touch the round", async () => {
        const round = makeFlowRound({});
        const { store: s, stop } = openIn(round);

        s.setState({ round: { ...round } });
        await vi.advanceTimersByTimeAsync(600);

        expect(fs.writes).toEqual([]);
        stop();
    });

    it("writes nothing while no file is open", async () => {
        const round = makeFlowRound({});
        const s = createStore<DocState>()(() => ({ round: null, docPath: null }));
        const autosave = attachFlowAutosave(s);

        s.setState({ round, docPath: null });
        s.setState({ round: { ...round, updatedAt: round.updatedAt + 1 } });
        await vi.advanceTimersByTimeAsync(600);

        expect(fs.writes).toEqual([]);
        autosave.detach();
    });

    it("saves a single edit made right after Save As", async () => {
        // Save As sets docPath and then changes the route, so AppRoot tears the
        // subscriber down and builds a fresh one that never witnesses a load.
        // Inferring "just opened" from the round id used to swallow the next
        // edit outright; one edit followed by a close lost it with no error.
        const round = makeFlowRound({});
        const s = createStore<DocState>()(() => ({ round: null, docPath: null }));
        const first = attachFlowAutosave(s);
        s.setState({ round, docPath: "/a.ebb" });
        first.prime();

        s.setState({ docPath: "/b.ebb" });
        first.detach();
        const second = attachFlowAutosave(s);
        second.prime();

        s.setState({ round: { ...round, updatedAt: round.updatedAt + 1 } });
        second.detach();
        await vi.advanceTimersByTimeAsync(0);

        expect(fs.writes).toContain("/b.ebb");
    });

    it("stops waiting once edits have been arriving for the ceiling", async () => {
        // A reset-only debounce never fires during a fast speech, so a crash
        // would cost the whole burst instead of the last half second.
        const round = makeFlowRound({});
        const { store: s, stop } = openIn(round);

        for (let i = 1; i <= 40; i++) {
            s.setState({ round: { ...round, updatedAt: round.updatedAt + i } });
            await vi.advanceTimersByTimeAsync(100); // faster than the 500ms window
        }

        expect(fs.writes.length).toBeGreaterThan(0);
        stop();
    });

    it("reports a conflict rather than overwriting a file changed on disk", async () => {
        const round = makeFlowRound({});
        fs.files.set("/a.ebb", serializeFlow(round));
        // Opening is what records the version to compare against.
        await readFlowAt("/a.ebb", fs);

        const status = vi.fn();
        const s = createStore<DocState>()(() => ({ round: null, docPath: null }));
        const autosave = attachFlowAutosave(s, status);
        s.setState({ round, docPath: "/a.ebb" });
        autosave.prime();

        fs.conflictOn = "/a.ebb";
        s.setState({ round: { ...round, updatedAt: round.updatedAt + 1 } });
        await vi.advanceTimersByTimeAsync(600);

        expect(status.mock.calls.flat()).toContain("conflict");
        expect(fs.writes).toEqual([]);
        autosave.detach();
    });

    it("follows the round to a new path after Save As", async () => {
        const round = makeFlowRound({});
        const { store: s, stop } = openIn(round);

        s.setState({ round: { ...round, updatedAt: round.updatedAt + 1 }, docPath: "/b.ebb" });
        await vi.advanceTimersByTimeAsync(600);

        expect(fs.writes).toEqual(["/b.ebb"]);
        stop();
    });
});
