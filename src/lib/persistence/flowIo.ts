/**
 * JSON file import/export for FlowRounds. File version 3 is the
 * Handsontable-native model; versions 1-2 (the legacy node model) are
 * rejected - the rewrite is a fresh start.
 */

import { normalizeFlow, type FlowRound } from "@/lib/model/flow";
import { uid } from "@/lib/model/ids";

export const FLOW_FILE_VERSION = 3;

/** Serialize a round to a JSON string with version envelope. */
export function exportFlowJSON(round: FlowRound): string {
    return JSON.stringify({ version: FLOW_FILE_VERSION, round }, null, 2);
}

/** Serialize many rounds as one backup file. */
export function exportFlowBackupJSON(rounds: FlowRound[]): string {
    return JSON.stringify({ version: FLOW_FILE_VERSION, kind: "backup", rounds }, null, 2);
}

/** Fresh identity for an imported round: never clobbers, never trashed. */
function freshen(round: FlowRound): FlowRound {
    const now = Date.now();
    return {
        ...normalizeFlow(round),
        id: uid("round"),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

/** A structurally valid FlowRound: id, role, and sheets that carry data arrays. */
function isFlowRoundShape(value: unknown): value is FlowRound {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const r = value as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.role !== "string" || !Array.isArray(r.sheets)) {
        return false;
    }
    return (r.sheets as unknown[]).every((s) => {
        if (typeof s !== "object" || s === null) return false;
        const sheet = s as Record<string, unknown>;
        return typeof sheet.id === "string" && Array.isArray(sheet.data);
    });
}

function parseEnvelope(text: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Invalid JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Invalid round file");
    }
    const envelope = parsed as Record<string, unknown>;
    if (typeof envelope.version !== "number") throw new Error("Invalid round file");
    if (envelope.version !== FLOW_FILE_VERSION) {
        throw new Error(`Unsupported file version: ${envelope.version}`);
    }
    return envelope;
}

/**
 * Parse and validate a single-round JSON string, returning a FlowRound with a
 * fresh identity. Throws "Invalid JSON", "Unsupported file version: <v>", or
 * "Invalid round file".
 */
export function importFlowJSON(text: string): FlowRound {
    const envelope = parseEnvelope(text);
    if (!isFlowRoundShape(envelope.round)) throw new Error("Invalid round file");
    return freshen(envelope.round);
}

/**
 * Parse an import file that is EITHER a single-round `{version, round}` OR a
 * backup `{version, kind:"backup", rounds:[]}`. Returns rounds with fresh ids.
 */
export function parseFlowImportFile(text: string): FlowRound[] {
    const envelope = parseEnvelope(text);
    if (envelope.kind === "backup") {
        if (!Array.isArray(envelope.rounds)) throw new Error("Invalid round file");
        return (envelope.rounds as unknown[]).map((r) => {
            if (!isFlowRoundShape(r)) throw new Error("Invalid round file");
            return freshen(r);
        });
    }
    if (!isFlowRoundShape(envelope.round)) throw new Error("Invalid round file");
    return [freshen(envelope.round)];
}

// --- Browser helpers ---------------------------------------------------------
// Guarded so importing this module outside a browser never crashes; the APIs
// are only touched when called.

function formatDate(ts: number): string {
    const d = new Date(ts);
    const yyyy = d.getFullYear().toString().padStart(4, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

function sanitizeSegment(s: string): string {
    return s.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

/** Trigger a browser download of the round as a JSON file. */
export function downloadFlowFile(round: FlowRound): void {
    const json = exportFlowJSON(round);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const date = formatDate(round.updatedAt ?? Date.now());
    const role = sanitizeSegment(round.role);
    const filename = `debate-flow-${role}-${date}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Read a File object and return the parsed FlowRound. */
export async function readFlowFile(file: File): Promise<FlowRound> {
    let text: string;
    if (typeof file.text === "function") {
        text = await file.text();
    } else {
        text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }
    return importFlowJSON(text);
}
