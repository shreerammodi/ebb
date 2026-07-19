/**
 * Handsontable-native round model. Each sheet stores its grid as a 2D array of
 * cell text plus sparse per-cell metadata; columns are never stored (they
 * derive from the Policy column list and the sheet's startSpeechId).
 */

import { getEvent, type EventId } from "@/lib/format/events";
import { uid } from "@/lib/model/ids";
import type { Role, Scouting, Side } from "@/lib/model/types";

export interface CellMeta {
    bold?: boolean;
    highlight?: boolean;
    /** Tags the cell as a card (a piece of evidence). */
    card?: boolean;
    /** Marks the cell as part of a visual group (a left bar hugging the run). */
    group?: boolean;
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
    /** Leftmost speech column shown (absent = the side's first speech in the round's event). */
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
    /** Debate event; absent (legacy rounds) = "policy". */
    event?: EventId;
    /** First-speaking side; meaningful only for variable-order events (PF). */
    firstSide?: Side;
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
        data: [],
        meta: {},
    };
}

/** The pinned cross-examination sheet. order = -1 so it sorts above flow sheets. */
export function makeCxFlowSheet(title = "CX"): FlowSheet {
    return {
        id: uid("sheet"),
        title,
        group: "aff",
        order: -1,
        kind: "cx",
        data: [],
        meta: {},
    };
}

export function makeFlowRound(input: { role: Role; event?: EventId; firstSide?: Side }): FlowRound {
    const now = Date.now();
    const event = input.event ?? "policy";
    const side = input.role === "judge" ? "aff" : input.role;
    return {
        id: uid("round"),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        role: input.role,
        event,
        firstSide: input.firstSide ?? "aff",
        scouting: emptyScouting(),
        sheets: [
            makeCxFlowSheet(getEvent(event).crossEx.title),
            makeFlowSheet({ title: "1.", group: side, order: 0 }),
        ],
    };
}

/** Fill defaults on a round read from storage or import. Never mutates input. */
export function normalizeFlow(raw: FlowRound): FlowRound {
    const r: FlowRound = {
        ...raw,
        event: raw.event ?? "policy",
        firstSide: raw.firstSide ?? "aff",
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
