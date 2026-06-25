import type { RoundSummary } from "./summary";
import { fuzzySearch, toSegments, type Segment } from "@/lib/search/fuzzy";

export interface FlowMatch {
    summary: RoundSummary;
    /** Segmented snippet from the content index when matched there; else null. */
    snippet: Segment[] | null;
}

const SNIPPET_RADIUS = 40;

/** Build a short snippet window around the first match range. */
function snippetFor(haystack: string, ranges: number[]): Segment[] | null {
    if (!ranges.length) return null;
    const start = Math.max(0, ranges[0] - SNIPPET_RADIUS);
    const end = Math.min(
        haystack.length,
        ranges[ranges.length - 1] + SNIPPET_RADIUS,
    );
    const slice = haystack.slice(start, end);
    const shifted = ranges.map((r) => Math.max(0, r - start));
    const prefix = start > 0 ? "…" : "";
    const suffix = end < haystack.length ? "…" : "";
    const segs = toSegments(slice, shifted);
    return [
        { text: prefix, match: false },
        ...segs,
        { text: suffix, match: false },
    ];
}

/**
 * Filter + rank flows by a query over the precomputed content index
 * (which already contains scouting + node text). Blank query → all flows
 * in their incoming order, no snippets.
 */
export function filterFlows(
    summaries: RoundSummary[],
    index: Map<string, string>,
    query: string,
): FlowMatch[] {
    const q = query.trim();
    if (!q) return summaries.map((s) => ({ summary: s, snippet: null }));

    const ids = summaries.map((s) => s.id);
    const haystack = ids.map((id) => index.get(id) ?? "");
    const byId = new Map(summaries.map((s) => [s.id, s]));

    const { order, ranges } = fuzzySearch(haystack, q);
    const out: FlowMatch[] = [];
    for (let i = 0; i < order.length; i++) {
        const id = ids[order[i]];
        const summary = byId.get(id);
        if (!summary) continue;
        out.push({
            summary,
            snippet: snippetFor(haystack[order[i]], ranges[i] ?? []),
        });
    }
    return out;
}
