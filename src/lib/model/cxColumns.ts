import type { Speech, Round } from "./types";

/**
 * The fixed columns for a CX sheet: a Question + Response column per CX period,
 * grouped by period. Side = questioner (opponent of the named speech) for the
 * Question column, answerer for the Response column, so colors alternate.
 * Ids are stable constants (CX nodes reference them via ArgumentNode.speechId).
 */
export const CX_COLUMNS: Speech[] = [
    {
        id: "cx-1ac-q",
        name: "Question",
        side: "neg",
        seconds: 0,
        group: "1AC CX",
    },
    {
        id: "cx-1ac-r",
        name: "Response",
        side: "aff",
        seconds: 0,
        group: "1AC CX",
    },
    {
        id: "cx-1nc-q",
        name: "Question",
        side: "aff",
        seconds: 0,
        group: "1NC CX",
    },
    {
        id: "cx-1nc-r",
        name: "Response",
        side: "neg",
        seconds: 0,
        group: "1NC CX",
    },
    {
        id: "cx-2ac-q",
        name: "Question",
        side: "neg",
        seconds: 0,
        group: "2AC CX",
    },
    {
        id: "cx-2ac-r",
        name: "Response",
        side: "aff",
        seconds: 0,
        group: "2AC CX",
    },
    {
        id: "cx-2nc-q",
        name: "Question",
        side: "aff",
        seconds: 0,
        group: "2NC CX",
    },
    {
        id: "cx-2nc-r",
        name: "Response",
        side: "neg",
        seconds: 0,
        group: "2NC CX",
    },
];

/** Columns to render for a sheet: CX columns for a cx sheet, else format speeches. */
export function columnsForSheet(round: Round, sheetId: string): Speech[] {
    const sheet = round.sheets.find((s) => s.id === sheetId);
    return sheet?.kind === "cx" ? CX_COLUMNS : round.format.speeches;
}
