import { afterEach } from "vitest";

import { setFlowFs, type FlowFs, type FlowLocations } from "@/lib/persistence/flowFs";
import { basename, dedupeFilename, joinPath } from "@/lib/persistence/flowPaths";
import { forgetSeenStamp } from "@/lib/persistence/flowSession";

export const HOME = "/home/test";
export const FLOWS_DIR = "/home/test/Documents/ebb";

export interface FakeFlowFs extends FlowFs {
    /** The virtual disk, keyed by absolute path. */
    files: Map<string, string>;
    /** What the next open picker returns; null cancels. */
    nextOpen: string | null;
    /** What the next save picker returns; null cancels. */
    nextSave: string | null;
    /** What the next folder picker returns; null cancels. */
    nextDirectory: string | null;
    /** Paths passed to reveal, in order. */
    revealed: string[];
    /** Paths passed to dragOut, in order. */
    dragged: string[];
    /** Writes performed, in order, so tests can assert on autosave behavior. */
    writes: string[];
    /** Make the next write of any kind fail with this message. */
    failWrites: string | null;
    /** Pretend the file changed underneath ebb: the next guarded write is refused. */
    conflictOn: string | null;
    /** Stamps handed back by readFlow and writeFlow. */
    stamps: Map<string, number>;
}

/**
 * A filesystem the tests own outright.
 *
 * Every layer above the FlowFs port - the session, recents, the migration, the
 * start screen - runs against this unchanged, which is the reason the port
 * exists: none of that behavior needs Tauri IPC mocked to be tested.
 */
export function installFakeFlowFs(): FakeFlowFs {
    const fs: FakeFlowFs = {
        files: new Map(),
        nextOpen: null,
        nextSave: null,
        nextDirectory: null,
        revealed: [],
        dragged: [],
        writes: [],
        failWrites: null,
        conflictOn: null,
        stamps: new Map(),

        locations: () => Promise.resolve<FlowLocations>({ flowsDir: FLOWS_DIR, home: HOME }),

        pickOpenPath: () => Promise.resolve(fs.nextOpen),
        pickSavePath: () => Promise.resolve(fs.nextSave),
        pickDirectory: () => Promise.resolve(fs.nextDirectory),

        createFlow: (dir, name, text) => {
            if (fs.failWrites) return Promise.reject(new Error(fs.failWrites));
            const taken = new Set(
                [...fs.files.keys()].filter((p) => p.startsWith(dir + "/")).map(basename),
            );
            const path = joinPath(dir, dedupeFilename(name, taken));
            fs.files.set(path, text);
            fs.stamps.set(path, 1);
            fs.writes.push(path);
            return Promise.resolve(path);
        },

        readFlow: (path) => {
            const text = fs.files.get(path);
            if (text === undefined) return Promise.resolve(null);
            return Promise.resolve({ text, mtimeMs: fs.stamps.get(path) ?? 1 });
        },

        writeFlow: (path, text, expectedMtimeMs) => {
            if (fs.failWrites) return Promise.reject(new Error(fs.failWrites));
            // Mirrors the shell: a guarded write over a changed file is refused
            // with the tagged string Tauri rejects with.
            if (fs.conflictOn === path && expectedMtimeMs != null) {
                return Promise.reject(`conflict:${path} changed outside ebb`);
            }
            fs.files.set(path, text);
            const mtimeMs = (fs.stamps.get(path) ?? 1) + 1;
            fs.stamps.set(path, mtimeMs);
            fs.writes.push(path);
            return Promise.resolve(mtimeMs);
        },

        readRecents: () => Promise.resolve(fs.files.get("/config/recents.json") ?? null),

        writeRecents: (text) => {
            fs.files.set("/config/recents.json", text);
            return Promise.resolve();
        },

        reveal: (path) => {
            fs.revealed.push(path);
            return Promise.resolve();
        },

        dragOut: (path) => {
            fs.dragged.push(path);
            return Promise.resolve();
        },
    };

    setFlowFs(fs);
    forgetSeenStamp();
    afterEach(() => {
        setFlowFs(null);
        forgetSeenStamp();
    });
    return fs;
}
