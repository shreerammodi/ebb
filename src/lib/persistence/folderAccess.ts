/**
 * Whether Windows lets ebb write the flows folder, and asking it to.
 *
 * Controlled Folder Access in Windows Security guards Documents, where the
 * flows folder lives by default, and refuses writes from apps it does not
 * know. Every save and every new flow then fails, and the only sign is a
 * Windows notification a debater may never tie to ebb. The start screen
 * checks on launch, so the question comes before a round is at stake.
 *
 * Only Windows is checked: nothing else refuses a folder this way, and a
 * folder that is read-only on purpose is the debater's business.
 */

import { getSystemInfo } from "@/lib/update/adapter";

import { getFlowFs, type FlowFs } from "./flowFs";
import { resolveFlowsDir } from "./flowsDir";

/** The flows folder when Windows refuses ebb writes to it; null otherwise. */
export async function blockedFlowsDir(fs?: FlowFs): Promise<string | null> {
    const info = await getSystemInfo();
    if (info?.[0] !== "windows") return null;
    const io = fs ?? (await getFlowFs());
    const dir = await resolveFlowsDir(io);
    return (await io.probeDir(dir)) === "blocked" ? dir : null;
}

/**
 * Raise the UAC prompt to add ebb to Controlled Folder Access's allowed apps.
 * True once Windows accepted the change; whether the folder is writable now
 * is a separate question, since a school-managed machine can accept it and
 * still enforce its own list.
 */
export async function allowEbbInControlledFolders(): Promise<boolean> {
    // Platform-only module: the browser bundle must not pull it in.
    const { invoke } = await import("@tauri-apps/api/core");
    try {
        return await invoke<boolean>("allow_in_controlled_folders");
    } catch {
        return false;
    }
}
