import uFuzzy from "@leeoniya/ufuzzy";

/** Ranked haystack indices plus per-result flat match ranges. */
export interface FuzzyResult {
  /** Haystack indices, best match first. */
  order: number[];
  /** ranges[i] is a flat [start, end, start, end, ...] array for order[i]. */
  ranges: number[][];
}

/** A run of text that is either part of a match or not. */
export interface Segment {
  text: string;
  match: boolean;
}

// Single instance reused across keystrokes. intraMode 1 tolerates one typo per term.
const uf = new uFuzzy({ intraMode: 1 });

/**
 * Fuzzy-searches `haystack` for `query`. Returns ranked haystack indices and the
 * match ranges for highlighting. Blank queries return an empty result.
 */
export function fuzzySearch(haystack: string[], query: string): FuzzyResult {
  const needle = query.trim();
  if (!needle) return { order: [], ranges: [] };

  const [idxs, info, order] = uf.search(haystack, needle);
  if (!idxs || idxs.length === 0) return { order: [], ranges: [] };

  // info/order are skipped above uFuzzy's infoThresh; fall back to unranked idxs.
  if (!info || !order) {
    return { order: idxs, ranges: idxs.map(() => []) };
  }

  return {
    order: order.map((o) => info.idx[o]),
    ranges: order.map((o) => info.ranges[o]),
  };
}

/**
 * Splits `text` into matched/unmatched segments using a flat [start, end, ...]
 * ranges array (as returned per result by `fuzzySearch`).
 */
export function toSegments(text: string, ranges: number[]): Segment[] {
  if (!ranges || ranges.length === 0) return [{ text, match: false }];
  const segments: Segment[] = [];
  let pos = 0;
  for (let i = 0; i < ranges.length; i += 2) {
    const start = ranges[i];
    const end = ranges[i + 1];
    if (start > pos) segments.push({ text: text.slice(pos, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), match: false });
  return segments;
}
