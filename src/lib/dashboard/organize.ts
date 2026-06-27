import type { RoundSummary } from "./summary";

export type SortKey = "updated" | "date" | "tournament" | "result";

/** Stable sort of summaries by the chosen key. */
export function sortSummaries(list: RoundSummary[], key: SortKey): RoundSummary[] {
    const copy = [...list];
    switch (key) {
        case "updated":
            return copy.sort((a, b) => b.updatedAt - a.updatedAt);
        case "date":
            return copy.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
        case "tournament":
            return copy.sort((a, b) => (a.tournament ?? "~").localeCompare(b.tournament ?? "~"));
        case "result":
            return copy.sort((a, b) =>
                (a.decision?.vote ?? "~").localeCompare(b.decision?.vote ?? "~"),
            );
    }
}

export interface FlowGroup {
    label: string;
    items: RoundSummary[];
}

/** Group summaries under tournament headers; untitled flows go to a final "No tournament" group. */
export function groupByTournament(list: RoundSummary[]): FlowGroup[] {
    const byName = new Map<string, RoundSummary[]>();
    const untitled: RoundSummary[] = [];
    for (const s of list) {
        const t = s.tournament?.trim();
        if (!t) {
            untitled.push(s);
            continue;
        }
        if (!byName.has(t)) byName.set(t, []);
        byName.get(t)!.push(s);
    }
    const groups: FlowGroup[] = [...byName.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((label) => ({ label, items: byName.get(label)! }));
    if (untitled.length) groups.push({ label: "No tournament", items: untitled });
    return groups;
}
