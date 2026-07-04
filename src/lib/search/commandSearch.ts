/**
 * Fuzzy search over the command registry. Powers the palette's command mode
 * (query prefixed with ">"): ranks commands by label, best match first, with
 * matched character positions kept for highlighting.
 */

import uFuzzy from "@leeoniya/ufuzzy";

import { COMMANDS, type CommandId } from "@/lib/commands/registry";

import { rangesToPositions } from "./cellSearch";

export interface CommandHit {
    id: CommandId;
    label: string;
    /** Indices into `label` that matched the query; empty for the no-query listing. */
    positions: number[];
}

const ALL = Object.values(COMMANDS);
const uf = new uFuzzy();

/** Fuzzy-rank commands against `query`; an empty query lists them all in order. */
export function searchCommands(query: string): CommandHit[] {
    const q = query.trim();
    if (!q) return ALL.map((c) => ({ id: c.id, label: c.label, positions: [] }));

    const haystack = ALL.map((c) => c.label);
    const idxs = uf.filter(haystack, q);
    if (!idxs || idxs.length === 0) return [];
    const info = uf.info(idxs, haystack, q);
    const order = uf.sort(info, haystack, q);

    return order.map((oi) => {
        const c = ALL[info.idx[oi]];
        return { id: c.id, label: c.label, positions: rangesToPositions(info.ranges[oi]) };
    });
}
