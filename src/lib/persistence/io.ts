import type { Round } from "@/lib/model/types";
import { normalizeRound } from "@/lib/model/normalize";
import { uid } from "@/lib/model/ids";

// ─── Version ──────────────────────────────────────────────────────────────────

export const FILE_VERSION = 2;

/** Versions importRoundJSON can read (older are migrated via normalizeRound). */
const SUPPORTED_VERSIONS = new Set([1, 2]);

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Serialize a Round to a JSON string with version envelope.
 * NOTE: display settings (autoNumber, labelDrops) are intentionally NOT included —
 * they are per-device user preferences in localStorage, not round data.
 */
export function exportRoundJSON(round: Round): string {
    return JSON.stringify({ version: FILE_VERSION, round }, null, 2);
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Parse and validate a JSON string, returning a Round.
 *
 * Throws:
 *   'Invalid JSON'                     — text is not valid JSON
 *   'Unsupported file version: <v>'    — version field != FILE_VERSION
 *   'Invalid round file'               — missing required fields / wrong shape
 */
export function importRoundJSON(text: string): Round {
    // 1. Parse
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Invalid JSON");
    }

    // 2. Top-level shape: must be an object
    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error("Invalid round file");
    }
    const envelope = parsed as Record<string, unknown>;

    // 3. Version must be a number
    if (typeof envelope.version !== "number") {
        throw new Error("Invalid round file");
    }

    // 4. Version must be supported
    if (!SUPPORTED_VERSIONS.has(envelope.version)) {
        throw new Error(`Unsupported file version: ${envelope.version}`);
    }

    // 5. round must be an object
    const round = envelope.round;
    if (typeof round !== "object" || round === null || Array.isArray(round)) {
        throw new Error("Invalid round file");
    }
    const r = round as Record<string, unknown>;

    // 6. Required top-level fields
    if (
        typeof r.id !== "string" ||
        typeof r.role !== "string" ||
        typeof r.format !== "object" ||
        r.format === null ||
        !Array.isArray(r.sheets) ||
        !Array.isArray(r.nodes)
    ) {
        throw new Error("Invalid round file");
    }

    const normalized = normalizeRound(round as Round);
    const now = Date.now();
    return {
        ...normalized,
        id: uid("round"),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

// ─── Browser helpers ──────────────────────────────────────────────────────────
// These functions reference browser-only globals (Blob, document, FileReader).
// The guards ensure importing this module in a non-browser environment (e.g. tests
// of pure functions, SSR) does not crash — the APIs are only touched when called.

/**
 * Format a timestamp as YYYYMMDD.
 */
function formatDate(ts: number): string {
    const d = new Date(ts);
    const yyyy = d.getFullYear().toString().padStart(4, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

/**
 * Sanitize a string for use as a filename segment.
 * Replaces anything that isn't alphanumeric, '-', or '_' with '-'.
 */
function sanitizeSegment(s: string): string {
    return s.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

/**
 * Trigger a browser download of the round as a JSON file.
 * Filename: debate-flow-<role>-<YYYYMMDD>.json
 */
export function downloadRoundFile(round: Round): void {
    const json = exportRoundJSON(round);
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

/**
 * Read a File object and return the parsed Round.
 * Uses File.text() if available (modern browsers + jsdom), falling back to FileReader.
 */
export async function readRoundFile(file: File): Promise<Round> {
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

    return importRoundJSON(text);
}
