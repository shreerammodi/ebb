/**
 * Speech columns with stable ids. Columns are never stored on a round; a
 * sheet's visible columns derive from this module plus its startSpeechId.
 * Names match the Flow.xlsx template columns exactly (see lib/export/columns).
 */

import type { FlowSheet } from "@/lib/model/flow";
import type { Side } from "@/lib/model/types";

export interface SpeechCol {
    id: string;
    name: string;
    side: Side;
    /** CX period label; groups render as a second header tier. */
    group?: string;
}

export const POLICY_COLUMNS: SpeechCol[] = [
    { id: "1ac", name: "1AC", side: "aff" },
    { id: "1nc", name: "1NC", side: "neg" },
    { id: "2ac", name: "2AC", side: "aff" },
    { id: "block", name: "Block", side: "neg" },
    { id: "1ar", name: "1AR", side: "aff" },
    { id: "2nr", name: "2NR", side: "neg" },
    { id: "2ar", name: "2AR", side: "aff" },
];

/** Question/Response pair per CX period; question side = the questioner. */
export const CX_FLOW_COLUMNS: SpeechCol[] = [
    { id: "cx-1ac-q", name: "Question", side: "neg", group: "1AC CX" },
    { id: "cx-1ac-r", name: "Response", side: "aff", group: "1AC CX" },
    { id: "cx-1nc-q", name: "Question", side: "aff", group: "1NC CX" },
    { id: "cx-1nc-r", name: "Response", side: "neg", group: "1NC CX" },
    { id: "cx-2ac-q", name: "Question", side: "neg", group: "2AC CX" },
    { id: "cx-2ac-r", name: "Response", side: "aff", group: "2AC CX" },
    { id: "cx-2nc-q", name: "Question", side: "aff", group: "2NC CX" },
    { id: "cx-2nc-r", name: "Response", side: "neg", group: "2NC CX" },
];

/**
 * The columns a sheet shows: CX sheets use the fixed set; flow sheets show
 * from their leftmost speech (startSpeechId, else derived from side) onward.
 */
export function columnsForFlowSheet(sheet: FlowSheet): SpeechCol[] {
    if (sheet.kind === "cx") return CX_FLOW_COLUMNS;
    const startId = sheet.startSpeechId ?? (sheet.group === "neg" ? "1nc" : "1ac");
    const idx = POLICY_COLUMNS.findIndex((c) => c.id === startId);
    return idx === -1 ? POLICY_COLUMNS : POLICY_COLUMNS.slice(idx);
}
