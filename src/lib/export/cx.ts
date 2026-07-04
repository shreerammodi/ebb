/**
 * Shared cross-examination pairing. The CX sheet stores its grid with one
 * Question/Response column pair per period (see CX_FLOW_COLUMNS); period i
 * reads columns 2i and 2i+1. Both the Excel CX worksheet and any print
 * layout consume this.
 */
import type { FlowRound } from "@/lib/model/flow";

export interface CxPeriodDef {
    /** Question column id. */
    qId: string;
    /** Response column id. */
    rId: string;
    /** Human label, e.g. "1AC CX". */
    label: string;
}

export const CX_PERIODS: CxPeriodDef[] = [
    { qId: "cx-1ac-q", rId: "cx-1ac-r", label: "1AC CX" },
    { qId: "cx-1nc-q", rId: "cx-1nc-r", label: "1NC CX" },
    { qId: "cx-2ac-q", rId: "cx-2ac-r", label: "2AC CX" },
    { qId: "cx-2nc-q", rId: "cx-2nc-r", label: "2NC CX" },
];

export interface CxPair {
    question: string;
    response: string;
}

export interface CxPeriod extends CxPeriodDef {
    pairs: CxPair[];
}

/** Resolve ordered Question/Response pairs for each CX period. */
export function cxPeriods(round: FlowRound): CxPeriod[] {
    const cxSheet = round.sheets.find((s) => s.kind === "cx");
    const data = cxSheet?.data ?? [];
    return CX_PERIODS.map((p, i) => {
        const qCol = 2 * i;
        const rCol = qCol + 1;
        const pairs: CxPair[] = [];
        for (const row of data) {
            const question = row[qCol] ?? "";
            const response = row[rCol] ?? "";
            if (question.trim() === "" && response.trim() === "") continue;
            pairs.push({ question, response });
        }
        return { ...p, pairs };
    });
}
