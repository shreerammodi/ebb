import type { Round, Scouting, Sheet } from "./types";
import { uid } from "./ids";

const emptyDebater = () => ({ first: "", last: "" });

export function emptyScouting(): Scouting {
  return {
    aff: { first: emptyDebater(), second: emptyDebater() },
    neg: { first: emptyDebater(), second: emptyDebater() },
  };
}

/** A fresh pinned CX sheet. order = -1 so it sorts above flow sheets. */
export function makeCxSheet(): Sheet {
  return { id: uid("sheet"), title: "CX", group: "aff", order: -1, kind: "cx" };
}

/**
 * Normalize a round read from storage/import: fill in new fields, default
 * sheet kind, drop the legacy topic + cx, fold the legacy `meta` field forward
 * into scouting, and ensure exactly one CX sheet exists.
 */
export function normalizeRound(raw: Round): Round {
  const r = { ...raw } as Round & { topic?: unknown; cx?: unknown; meta?: Record<string, string> };
  delete r.topic;
  delete r.cx;
  // Copy scouting before any mutation below so we never mutate the caller's object.
  r.scouting = r.scouting ? { ...r.scouting } : emptyScouting();
  // Fold legacy round.meta (removed field) forward into scouting.
  const legacyMeta = r.meta;
  if (legacyMeta) {
    if (legacyMeta.tournament && !r.scouting.tournament) r.scouting.tournament = legacyMeta.tournament;
    if (legacyMeta.judge && !r.scouting.judge) r.scouting.judge = legacyMeta.judge;
    if (legacyMeta.roundLabel && !r.scouting.round) r.scouting.round = legacyMeta.roundLabel;
  }
  delete r.meta;
  r.sheets = r.sheets.map((s) => ({ ...s, kind: s.kind ?? "flow" }));
  if (Array.isArray(r.nodes)) {
    r.nodes = r.nodes.map((n) => ({ ...n, bold: n.bold ?? false }));
  }
  if (!Array.isArray(r.groups)) r.groups = [];
  if (!r.sheets.some((s) => s.kind === "cx")) {
    r.sheets = [makeCxSheet(), ...r.sheets];
  }
  return r;
}
