/**
 * Keyboard "grab & link" legality and placement rules.
 *
 * These pure helpers decide whether a grabbed unit may be linked under a
 * target and where its head lands, so the command layer stays thin and the
 * rules are unit-tested.
 *
 * ASSUMPTION (shared with layout.ts): a response lives in a LATER column than
 * its parent, and never links under itself or its own responses (that would
 * make a cycle the layout merely tolerates).
 */

import { ancestorIds } from "@/lib/grid/coords";
import type { ArgumentNode, Speech } from "@/lib/model/types";
import { unitBandBottom, unitHeadOf, unitOf, unitSubtreeIds } from "@/lib/model/units";

/** Column index of a speech, or -1. */
function colOf(speeches: Speech[], speechId: string): number {
    return speeches.findIndex((s) => s.id === speechId);
}

/**
 * Can the grabbed unit (by head id) be linked to the unit containing
 * `targetNodeId`? The parent must live in a STRICTLY earlier column (shared
 * layout assumption), on the same sheet, and outside the grabbed unit's own
 * band (a link into your own responses would cycle).
 */
export function isValidLinkTarget(
    nodes: ArgumentNode[],
    speeches: Speech[],
    headId: string,
    targetNodeId: string,
): boolean {
    const head = nodes.find((n) => n.id === headId);
    const target = nodes.find((n) => n.id === targetNodeId);
    if (!head || !target || target.sheetId !== head.sheetId) return false;
    const band = unitSubtreeIds(nodes, headId);
    if (band.has(target.id)) return false;
    const parentHead = unitHeadOf(nodes, target);
    if (band.has(parentHead.id)) return false;
    const parentCol = colOf(speeches, parentHead.speechId);
    const headCol = colOf(speeches, head.speechId);
    return parentCol !== -1 && headCol !== -1 && parentCol < headCol;
}

/**
 * Where the linked unit's head lands: beside the parent head, or - when the
 * parent already has answers in the linked unit's own column - stacked below
 * the deepest of those answers' bands. Null when either node is missing.
 */
export function linkSnapRow(
    nodes: ArgumentNode[],
    headId: string,
    parentHeadId: string,
): number | null {
    const head = nodes.find((n) => n.id === headId);
    const parentHead = nodes.find((n) => n.id === parentHeadId);
    if (!head || !parentHead) return null;
    const moving = unitSubtreeIds(nodes, headId);
    const rest = nodes.filter((n) => !moving.has(n.id));
    const parentBand = unitSubtreeIds(rest, parentHeadId);
    let row = parentHead.row;
    for (const n of rest) {
        if (!parentBand.has(n.id)) continue;
        if (n.sheetId !== head.sheetId || n.speechId !== head.speechId) continue;
        row = Math.max(row, unitBandBottom(rest, n) + 1);
    }
    return row;
}

/**
 * Nodes a link snap's collision ripple must never move: the new parent's
 * whole band plus every ancestor unit above it. Without this the ripple
 * would push the parent down and strand the freshly linked answer above it.
 */
export function linkRippleExclusions(nodes: ArgumentNode[], parentHeadId: string): Set<string> {
    const out = unitSubtreeIds(nodes, parentHeadId);
    for (const aid of ancestorIds(nodes, parentHeadId)) {
        const a = nodes.find((n) => n.id === aid);
        if (!a) continue;
        for (const m of unitOf(nodes, a)) out.add(m.id);
    }
    return out;
}
