/**
 * Drop detection for debate flows.
 *
 * A node is "dropped" when the opposing side had a later speech that occurred
 * (had at least one node on the sheet) but failed to answer that node.
 *
 * Interpretation note: "the earliest opposing speech that happened" means the
 * first speech in format order, after the node's speech, whose side is opposite
 * AND which has at least one node on the given sheet. If that speech exists but
 * has no child of the node in question, the node is considered dropped.
 *
 * Only nodes on the given sheetId are considered; nodes on other sheets are
 * silently ignored.
 */

import type { ArgumentNode, Format, Side } from "@/lib/model/types";

function oppositeSide(side: Side): Side {
    return side === "aff" ? "neg" : "aff";
}

/**
 * Returns the ids of all dropped nodes for the given sheet.
 *
 * A node n (in speech S with side X) is dropped if:
 * 1. There is a speech S2 after S in format order with side opposite(X).
 * 2. S2 has at least one node on `sheetId` (it "happened").
 * 3. No node on `sheetId` has parentId === n.id AND speechId === S2.id.
 *
 * We use the FIRST (earliest) such S2 with content as the answer obligation.
 */
export function detectDrops(
    nodes: ArgumentNode[],
    format: Format,
    sheetId: string,
): string[] {
    // Work only with nodes on this sheet.
    const sheetNodes = nodes.filter((n) => n.sheetId === sheetId);

    // Build a set of speechIds that have at least one node on this sheet.
    const speechesWithContent = new Set(sheetNodes.map((n) => n.speechId));

    // Build a lookup: speechId → index in format.speeches.
    const speechIndex = new Map<string, number>(
        format.speeches.map((s, i) => [s.id, i]),
    );

    const dropped: string[] = [];

    for (const node of sheetNodes) {
        const nodeIdx = speechIndex.get(node.speechId);
        if (nodeIdx === undefined) continue; // speech not in format, skip

        const nodeSide = format.speeches[nodeIdx].side;
        const targetSide = oppositeSide(nodeSide);

        // Find the earliest opposing speech after this node's speech that has content.
        let firstOpposingSpeech: string | null = null;
        for (let i = nodeIdx + 1; i < format.speeches.length; i++) {
            const s = format.speeches[i];
            if (s.side === targetSide && speechesWithContent.has(s.id)) {
                firstOpposingSpeech = s.id;
                break;
            }
        }

        // If no opposing speech happened, the node cannot be dropped yet.
        if (firstOpposingSpeech === null) continue;

        // Check whether any node on this sheet answers our node in that speech.
        const answered = sheetNodes.some(
            (n) => n.parentId === node.id && n.speechId === firstOpposingSpeech,
        );

        if (!answered) {
            dropped.push(node.id);
        }
    }

    return dropped;
}

/**
 * Convenience wrapper — returns the count of dropped nodes for a sheet.
 */
export function dropCountForSheet(
    nodes: ArgumentNode[],
    format: Format,
    sheetId: string,
): number {
    return detectDrops(nodes, format, sheetId).length;
}
