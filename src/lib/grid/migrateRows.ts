/**
 * One-shot migration: assign each node a `row` coordinate from the legacy
 * `parentId`+`order` tree, using the same packing the old elastic grid used
 * (buildLayout). Mutates the passed nodes in place (sets `row`, drops `order`).
 *
 * Used by the Dexie v6 upgrade (stored rounds) and by normalizeRound (imported
 * rounds) so legacy flows open visually identical, then become freely editable.
 */

import type { Format, Sheet } from "@/lib/model/types";
import { buildLayout, type LegacyNode } from "./layout";
import { columnsForSheet } from "./columns";

export type { LegacyNode } from "./layout";

/** A round as stored before the row-coordinate migration. */
export interface LegacyRound {
  format: Format;
  sheets: Sheet[];
  nodes: LegacyNode[];
}

export function assignRowsFromLegacyTree(round: LegacyRound): void {
  for (const sheet of round.sheets) {
    const columns = columnsForSheet(round.format, sheet);
    const sheetNodes = round.nodes.filter((n) => n.sheetId === sheet.id);
    const { placed } = buildLayout(sheetNodes, columns);
    const rowById = new Map(placed.map((p) => [p.node.id, p.startRow]));
    // Nodes whose speech is not in the column set get a fresh trailing row
    // so the occupancy invariant (one node per cell) still holds.
    let fallback = placed.length;
    for (const n of sheetNodes) {
      n.row = rowById.get(n.id) ?? fallback++;
      delete n.order;
    }
  }
}

/** True when any node still lacks a numeric `row` (i.e. legacy shape). */
export function needsRowMigration(nodes: LegacyNode[]): boolean {
  return nodes.some((n) => typeof n.row !== "number");
}
