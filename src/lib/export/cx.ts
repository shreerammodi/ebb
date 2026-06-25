/**
 * Shared cross-examination pairing. The CX sheet stores nodes as Question
 * (speechId 'cx-<period>-q') with a Response child (speechId 'cx-<period>-r').
 * Both the Excel CX sheet and the PDF CX layout consume this.
 */
import type { Round } from "@/lib/model/types";

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
export function cxPeriods(round: Round): CxPeriod[] {
    const cxSheet = round.sheets.find((s) => s.kind === "cx");
    const cxNodes = cxSheet
        ? round.nodes.filter((n) => n.sheetId === cxSheet.id)
        : [];
    return CX_PERIODS.map((p) => {
        const questions = cxNodes
            .filter((n) => n.speechId === p.qId)
            .sort((a, b) => a.row - b.row);
        const pairs = questions.map((q) => {
            const resp = cxNodes.find(
                (n) => n.parentId === q.id && n.speechId === p.rId,
            );
            return { question: q.text, response: resp?.text ?? "" };
        });
        return { ...p, pairs };
    });
}
