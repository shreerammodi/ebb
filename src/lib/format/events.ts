/**
 * Debate event definitions. An event lists each side's speeches in speaking
 * order; the full column order for a round is derived by strictly
 * alternating the two lists starting with the first-speaking side
 * (speechOrder). Policy fixes the aff as first speaker; PF's first speaker
 * comes from the flip (FlowRound.firstSide).
 */

import type { Side } from "@/lib/model/types";

export type EventId = "policy" | "pf" | "ld";

export interface SpeechDef {
    id: string;
    name: string;
    /** Column-header label; equals name for Policy. */
    short: string;
    side: Side;
}

export interface CrossExPeriod {
    label: string;
    /** Which team holds the question column: the first- or second-speaking side. */
    q: "first" | "second";
}

export interface EventDef {
    id: EventId;
    name: string;
    /** Each side's speeches in that side's own speaking order. */
    aff: SpeechDef[];
    neg: SpeechDef[];
    /** The flip decides who speaks first (PF); false = always aff-first. */
    variableOrder: boolean;
    /** `shared`: both sides question each other (PF crossfire), so columns are
     *  labelled by side rather than as questioner/responder. */
    crossEx: { title: string; periods: CrossExPeriod[]; shared?: boolean };
}

const speech = (id: string, name: string, short: string, side: Side): SpeechDef => ({
    id,
    name,
    short,
    side,
});

export const EVENTS: Record<EventId, EventDef> = {
    policy: {
        id: "policy",
        name: "Policy",
        aff: [
            speech("1ac", "1AC", "1AC", "aff"),
            speech("2ac", "2AC", "2AC", "aff"),
            speech("1ar", "1AR", "1AR", "aff"),
            speech("2ar", "2AR", "2AR", "aff"),
        ],
        neg: [
            speech("1nc", "1NC", "1NC", "neg"),
            speech("block", "Block", "Block", "neg"),
            speech("2nr", "2NR", "2NR", "neg"),
        ],
        variableOrder: false,
        crossEx: {
            title: "CX",
            periods: [
                { label: "1AC CX", q: "second" },
                { label: "1NC CX", q: "first" },
                { label: "2AC CX", q: "second" },
                { label: "2NC CX", q: "first" },
            ],
        },
    },
    pf: {
        id: "pf",
        name: "Public Forum",
        aff: [
            speech("ac", "Aff Constructive", "AC", "aff"),
            speech("ar", "Aff Rebuttal", "AR", "aff"),
            speech("as", "Aff Summary", "AS", "aff"),
            speech("af", "Aff Final Focus", "AF", "aff"),
        ],
        neg: [
            speech("nc", "Neg Constructive", "NC", "neg"),
            speech("nr", "Neg Rebuttal", "NR", "neg"),
            speech("ns", "Neg Summary", "NS", "neg"),
            speech("nf", "Neg Final Focus", "NF", "neg"),
        ],
        variableOrder: true,
        crossEx: {
            title: "Cross-Examination",
            shared: true,
            periods: [
                { label: "First Cross", q: "first" },
                { label: "Second Cross", q: "first" },
                { label: "Grand Cross", q: "first" },
            ],
        },
    },
    ld: {
        id: "ld",
        name: "Lincoln-Douglas",
        aff: [
            speech("1ac", "1AC", "1AC", "aff"),
            speech("1ar", "1AR", "1AR", "aff"),
            speech("2ar", "2AR", "2AR", "aff"),
        ],
        neg: [speech("1nc", "1NC", "1NC", "neg"), speech("2nr", "2NR", "2NR", "neg")],
        variableOrder: false,
        crossEx: {
            title: "CX",
            periods: [
                { label: "1AC CX", q: "second" },
                { label: "1NC CX", q: "first" },
            ],
        },
    },
};

export function getEvent(id?: EventId): EventDef {
    return EVENTS[id ?? "policy"];
}

/**
 * The round's full column order: the two side lists strictly alternated,
 * starting with firstSide. Uneven lists (Policy: 4 aff / 3 neg) interleave
 * until the shorter runs out, then the longer's tail follows.
 */
export function speechOrder(event: EventDef, firstSide: Side): SpeechDef[] {
    const first = firstSide === "aff" ? event.aff : event.neg;
    const second = firstSide === "aff" ? event.neg : event.aff;
    const order: SpeechDef[] = [];
    for (let i = 0; i < Math.max(first.length, second.length); i++) {
        if (first[i]) order.push(first[i]);
        if (second[i]) order.push(second[i]);
    }
    return order;
}
