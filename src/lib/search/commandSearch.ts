/**
 * Search over the command registry. Powers the palette's command mode
 * (query prefixed with ">"): order-independent multi-token matching ranked
 * by relevance tier, same-tier ties in registry order.
 */

import { COMMANDS, type CommandId } from "@/lib/commands/registry";

import { rank } from "./match";

export interface CommandHit {
    id: CommandId;
    label: string;
}

const ALL = Object.values(COMMANDS);

/** Rank commands against `query`; an empty query lists them all in order. */
export function searchCommands(query: string): CommandHit[] {
    return rank(
        ALL,
        query,
        (c) => c.label,
        () => "",
        () => 0,
    ).map((c) => ({ id: c.id, label: c.label }));
}
