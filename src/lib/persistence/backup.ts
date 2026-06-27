import { uid } from "@/lib/model/ids";
import { normalizeRound } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

import { FILE_VERSION, importRoundJSON } from "./io";

interface BackupEnvelope {
    version: number;
    kind: "backup";
    rounds: Round[];
}

/** Serialize many rounds as one backup file. */
export function exportBackupJSON(rounds: Round[]): string {
    const envelope: BackupEnvelope = {
        version: FILE_VERSION,
        kind: "backup",
        rounds,
    };
    return JSON.stringify(envelope, null, 2);
}

/** Give an imported round a fresh identity (never clobbers, never trashed). */
function freshen(round: Round): Round {
    const normalized = normalizeRound(round);
    const now = Date.now();
    return {
        ...normalized,
        id: uid("round"),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

/**
 * Parse an import file that is EITHER a single-flow `{version, round}` OR a
 * backup `{version, kind:"backup", rounds:[]}`. Returns rounds with fresh ids.
 * Throws on invalid input.
 */
export function parseImportFile(text: string): Round[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Invalid JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Invalid file");
    }
    const env = parsed as Record<string, unknown>;
    if (env.kind === "backup") {
        if (!Array.isArray(env.rounds)) throw new Error("Invalid backup file");
        return (env.rounds as Round[]).map(freshen);
    }
    // Single-flow path reuses importRoundJSON (which already freshens identity).
    return [importRoundJSON(text)];
}
