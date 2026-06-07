import { db } from "./db";
import type { Round } from "@/lib/model/types";
import { teamCode } from "@/lib/model/teamCode";

/**
 * Build the lowercased fuzzy-search haystack for a round:
 * scouting (team codes, schools, debater names, tournament, round, judge, RFD)
 * plus every node's text.
 */
export function buildSearchText(round: Round): string {
  const sc = round.scouting;
  const names = [sc.aff.first, sc.aff.second, sc.neg.first, sc.neg.second]
    .map((d) => `${d.first} ${d.last}`)
    .join(" ");
  const parts = [
    teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second),
    teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second),
    sc.affSchool ?? "",
    sc.negSchool ?? "",
    names,
    sc.tournament ?? "",
    sc.round ?? "",
    sc.judge ?? "",
    sc.decision?.rfd ?? "",
    ...round.nodes.map((n) => n.text),
  ];
  return parts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Write (insert/update) the search index row for a round. */
export async function writeSearchIndex(round: Round): Promise<void> {
  await db.searchIndex.put({ id: round.id, searchText: buildSearchText(round) });
}

/** Remove a round's search index row. */
export async function deleteSearchIndex(id: string): Promise<void> {
  await db.searchIndex.delete(id);
}

/** Load all search index rows as an id→searchText map. */
export async function loadSearchIndex(): Promise<Map<string, string>> {
  const rows = await db.searchIndex.toArray();
  return new Map(rows.map((r) => [r.id, r.searchText]));
}

/** Build any missing search index rows from stored rounds. Safe to call repeatedly. */
export async function backfillSearchIndex(): Promise<void> {
  const [rounds, rows] = await Promise.all([db.rounds.toArray(), db.searchIndex.toArray()]);
  const have = new Set(rows.map((r) => r.id));
  const missing = rounds.filter((r) => !have.has(r.id));
  if (missing.length === 0) return;
  await db.searchIndex.bulkPut(missing.map((r) => ({ id: r.id, searchText: buildSearchText(r) })));
}
