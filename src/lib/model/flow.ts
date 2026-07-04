/**
 * Handsontable-native round model. Each sheet stores its grid as a 2D array of
 * cell text plus sparse per-cell metadata; columns are never stored (they
 * derive from the Policy column list and the sheet's startSpeechId).
 */

import { uid } from "@/lib/model/ids";
import type { Role, Scouting } from "@/lib/model/types";

export interface CellMeta {
    bold?: boolean;
    highlight?: boolean;
    /** Reserved for the links phase; nothing reads or writes it yet. */
    answers?: { sheetId: string; row: number; col: number };
}

export interface FlowSheet {
    id: string;
    title: string;
    group: "aff" | "neg";
    order: number;
    /** Absent / "flow" = argument grid. "cx" = the cross-ex sheet. */
    kind?: "flow" | "cx";
    /** Leftmost speech column shown (absent = derive from group). */
    startSpeechId?: string;
    /** rows x speech-columns cell text, Handsontable-native. */
    data: (string | null)[][];
    /** Sparse per-cell metadata keyed "row,col". */
    meta: Record<string, CellMeta>;
}

export interface FlowRound {
    id: string;
    createdAt: number;
    updatedAt: number;
    /** ms timestamp when soft-deleted (moved to Trash); absent/null = live. */
    deletedAt?: number | null;
    role: Role;
    scouting: Scouting;
    sheets: FlowSheet[];
}

const emptyDebater = () => ({ first: "", last: "" });

export function emptyScouting(): Scouting {
    return {
        aff: { first: emptyDebater(), second: emptyDebater() },
        neg: { first: emptyDebater(), second: emptyDebater() },
    };
}

export function makeFlowSheet(input: {
    title: string;
    group: "aff" | "neg";
    order: number;
}): FlowSheet {
    return {
        id: uid("sheet"),
        title: input.title,
        group: input.group,
        order: input.order,
        kind: "flow",
        startSpeechId: input.group === "neg" ? "1nc" : "1ac",
        data: [],
        meta: {},
    };
}

/** The pinned CX sheet. order = -1 so it sorts above flow sheets. */
export function makeCxFlowSheet(): FlowSheet {
    return {
        id: uid("sheet"),
        title: "CX",
        group: "aff",
        order: -1,
        kind: "cx",
        data: [],
        meta: {},
    };
}

export function makeFlowRound(role: Role): FlowRound {
    const now = Date.now();
    const side = role === "judge" ? "aff" : role;
    return {
        id: uid("round"),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        role,
        scouting: emptyScouting(),
        sheets: [
            makeCxFlowSheet(),
            makeFlowSheet({ title: side === "neg" ? "Neg" : "Aff", group: side, order: 0 }),
        ],
    };
}

/** Fill defaults on a round read from storage or import. Never mutates input. */
export function normalizeFlow(raw: FlowRound): FlowRound {
    const r: FlowRound = {
        ...raw,
        scouting: raw.scouting ? { ...raw.scouting } : emptyScouting(),
        sheets: (raw.sheets ?? []).map((s) => ({
            ...s,
            kind: s.kind ?? "flow",
            data: Array.isArray(s.data) ? s.data : [],
            meta: s.meta ?? {},
        })),
    };
    if (!r.sheets.some((s) => s.kind === "cx")) {
        r.sheets = [makeCxFlowSheet(), ...r.sheets];
    }
    return r;
}

/** Sheets sorted ascending by order (CX first at order -1). */
export function sortedSheets(round: FlowRound): FlowSheet[] {
    return round.sheets.slice().sort((a, b) => a.order - b.order);
}

/** First flow (non-CX) sheet id by order, else the first sheet, else null. */
export function firstFlowSheetId(round: FlowRound): string | null {
    const sheets = sortedSheets(round);
    return (sheets.find((s) => s.kind !== "cx") ?? sheets[0])?.id ?? null;
}
