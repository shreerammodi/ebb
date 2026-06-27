import type { Round } from "@/lib/model/types";
import { columnsForSheet } from "@/lib/model/cxColumns";

/** A searchable sheet (title only). */
export interface SheetEntry {
  sheetId: string;
  title: string;
}

/** A searchable argument node with display context. */
export interface NodeEntry {
  nodeId: string;
  sheetId: string;
  speechId: string;
  /** Single-line, whitespace-collapsed text used for matching and display. */
  text: string;
  sheetTitle: string;
  speechName: string;
}

/** Entries plus index-aligned haystacks for uFuzzy. */
export interface SearchEntries {
  sheetEntries: SheetEntry[];
  sheetHaystack: string[];
  nodeEntries: NodeEntry[];
  nodeHaystack: string[];
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const EMPTY: SearchEntries = {
  sheetEntries: [],
  sheetHaystack: [],
  nodeEntries: [],
  nodeHaystack: [],
};

/**
 * Flattens a round into searchable sheet and node entries. Node entries exclude
 * empty-text nodes; their text is collapsed to a single line. Each carries the
 * label context needed to render and navigate. Pure — safe to memoize on
 * `round.sheets` / `round.nodes`.
 */
export function buildSearchEntries(round: Round | null): SearchEntries {
  if (!round) return EMPTY;

  const sheetEntries: SheetEntry[] = round.sheets.map((s) => ({
    sheetId: s.id,
    title: s.title,
  }));
  const sheetTitleById = new Map(round.sheets.map((s) => [s.id, s.title]));

  const nodeEntries: NodeEntry[] = [];
  for (const node of round.nodes) {
    const text = collapse(node.text);
    if (!text) continue;
    const speech = columnsForSheet(round, node.sheetId).find((c) => c.id === node.speechId);
    const speechName = speech
      ? speech.group
        ? `${speech.group} ${speech.name}`
        : speech.name
      : "";
    nodeEntries.push({
      nodeId: node.id,
      sheetId: node.sheetId,
      speechId: node.speechId,
      text,
      sheetTitle: sheetTitleById.get(node.sheetId) ?? "",
      speechName,
    });
  }

  return {
    sheetEntries,
    sheetHaystack: sheetEntries.map((e) => e.title),
    nodeEntries,
    nodeHaystack: nodeEntries.map((e) => e.text),
  };
}
