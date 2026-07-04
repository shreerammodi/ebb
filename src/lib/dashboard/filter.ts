import type { RoundSummary } from "./summary";

export interface FlowMatch {
    summary: RoundSummary;
}

/**
 * Filter flows by a query over the summary's scouting fields (team codes,
 * tournament, round, judge). Blank query returns all flows in their incoming
 * order. Full-text search over flow content returns with the search phase.
 */
export function filterFlows(summaries: RoundSummary[], query: string): FlowMatch[] {
    const q = query.trim().toLowerCase();
    if (!q) return summaries.map((s) => ({ summary: s }));
    return summaries
        .filter((s) =>
            [s.affTeam, s.negTeam, s.tournament ?? "", s.round ?? "", s.judge ?? ""]
                .join(" ")
                .toLowerCase()
                .includes(q),
        )
        .map((s) => ({ summary: s }));
}
