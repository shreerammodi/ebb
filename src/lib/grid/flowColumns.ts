/**
 * Speech columns with stable ids. Columns are never stored on a round; a
 * sheet's visible columns derive from the round's event definition plus the
 * sheet's startSpeechId, and the cross-examination sheet's columns derive
 * from the event's period list.
 */

import type Handsontable from "handsontable";

import { getEvent, speechOrder, type EventDef, type SpeechDef } from "@/lib/format/events";
import type { FlowRound, FlowSheet } from "@/lib/model/flow";
import type { Side } from "@/lib/model/types";

export interface SpeechCol extends SpeechDef {
    /** Cross-ex period label; groups render as a second header tier. */
    group?: string;
}

const other = (side: Side): Side => (side === "aff" ? "neg" : "aff");

/** Question/Response pair per cross-ex period; question side = the questioner. */
export function crossExColumns(event: EventDef, firstSide: Side): SpeechCol[] {
    return event.crossEx.periods.flatMap((p, i) => {
        const qSide = p.q === "first" ? firstSide : other(firstSide);
        return [
            { id: `cx-${i}-q`, name: "Question", short: "Question", side: qSide, group: p.label },
            {
                id: `cx-${i}-r`,
                name: "Response",
                short: "Response",
                side: other(qSide),
                group: p.label,
            },
        ];
    });
}

/**
 * The columns a sheet shows: cross-ex sheets pair Question/Response per
 * event period; flow sheets show from their leftmost speech (startSpeechId,
 * else the side's first speech in the round's event) onward.
 */
export function columnsForFlowSheet(round: FlowRound, sheet: FlowSheet): SpeechCol[] {
    const event = getEvent(round.event);
    const firstSide = round.firstSide ?? "aff";
    if (sheet.kind === "cx") return crossExColumns(event, firstSide);
    const order = speechOrder(event, firstSide);
    const startId = sheet.startSpeechId ?? event[sheet.group][0].id;
    const idx = order.findIndex((c) => c.id === startId);
    return idx === -1 ? order : order.slice(idx);
}

/** Header settings per sheet: cross-ex gets a period tier above Question/Response. */
export function headerSettings(sheet: FlowSheet, cols: SpeechCol[]) {
    if (sheet.kind === "cx") {
        const groups: { label: string; colspan: number }[] = [];
        for (const col of cols) {
            const last = groups[groups.length - 1];
            if (last && last.label === col.group) last.colspan++;
            else groups.push({ label: col.group ?? "", colspan: 1 });
        }
        return {
            colHeaders: true,
            nestedHeaders: [groups, cols.map((c) => c.name)],
        } satisfies Partial<Handsontable.GridSettings>;
    }
    return {
        colHeaders: cols.map((c) => c.short),
        nestedHeaders: undefined,
    } satisfies Partial<Handsontable.GridSettings>;
}
