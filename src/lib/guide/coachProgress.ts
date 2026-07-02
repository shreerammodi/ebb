import type { ArgumentNode } from "@/lib/model/types";

/**
 * coachProgress — derives the Flow Coach's step state from a sheet's nodes.
 *
 * The coached first exchange is three moves that build one argument reading
 * left-to-right across speeches:
 *   1. `argument` — a root argument is typed (depth 0).
 *   2. `answer`   — a response to it is typed (depth 1).
 *   3. `chain`    — a response to that response is typed (depth ≥ 2).
 *
 * Only nodes with non-whitespace text count: a deferred, still-empty response
 * slot is not yet a completed move.
 */
export interface CoachProgress {
    argument: boolean;
    answer: boolean;
    chain: boolean;
    /** Count of the three moves completed, 0–3. */
    completed: number;
    /** 1–3 for the first unfinished move, or 0 when all three are done. */
    activeStep: number;
}

export function flowCoachProgress(nodes: ArgumentNode[]): CoachProgress {
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const depth = (node: ArgumentNode): number => {
        let d = 0;
        let cur: ArgumentNode | undefined = node;
        const seen = new Set<string>();
        while (cur && cur.parentId != null && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = byId.get(cur.parentId);
            d++;
        }
        return d;
    };

    let argument = false;
    let answer = false;
    let chain = false;
    for (const n of nodes) {
        if (n.text.trim().length === 0) continue;
        const d = depth(n);
        if (d === 0) argument = true;
        else if (d === 1) answer = true;
        else chain = true;
    }

    // Steps are monotonic for display: a completed later move implies the
    // earlier ones are effectively done even if an intermediate node was
    // cleared, so the coach never shows step 2 undone while step 3 is done.
    const s1 = argument || answer || chain;
    const s2 = answer || chain;
    const s3 = chain;
    const completed = (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0);
    const activeStep = !s1 ? 1 : !s2 ? 2 : !s3 ? 3 : 0;

    return { argument: s1, answer: s2, chain: s3, completed, activeStep };
}
