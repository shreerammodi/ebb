/**
 * Fuzzy search over every filled cell in a flow. Powers the search palette:
 * one query ranks cells across all sheets, best match first, with the matched
 * character positions kept for highlighting.
 */

import uFuzzy from "@leeoniya/ufuzzy";

import { columnsForFlowSheet } from "@/lib/grid/flowColumns";
import { sortedSheets, type FlowRound } from "@/lib/model/flow";

export interface CellHit {
    sheetId: string;
    sheetTitle: string;
    row: number;
    col: number;
    /** Column header the cell sits under (e.g. "2AC", "Question"), for context. */
    colName: string;
    text: string;
    /** Indices into `text` that matched the query; empty for the no-query listing. */
    positions: number[];
}

type Cell = Omit<CellHit, "positions">;

/** Every non-empty cell in the round, in sheet-order then row-major. */
export function collectCells(round: FlowRound): Cell[] {
    const cells: Cell[] = [];
    for (const sheet of sortedSheets(round)) {
        const cols = columnsForFlowSheet(sheet);
        sheet.data.forEach((rowData, row) => {
            rowData.forEach((value, col) => {
                const text = value?.trim();
                if (!text) return;
                cells.push({
                    sheetId: sheet.id,
                    sheetTitle: sheet.title,
                    row,
                    col,
                    colName: cols[col]?.name ?? "",
                    text,
                });
            });
        });
    }
    return cells;
}

/** Cap on rows rendered; a flow rarely has this many filled cells anyway. */
const MAX_RESULTS = 50;

const uf = new uFuzzy();

/** Expand uFuzzy's flat [start, end, ...] match ranges into character indices. */
export function rangesToPositions(ranges: number[]): number[] {
    const positions: number[] = [];
    for (let i = 0; i < ranges.length; i += 2) {
        for (let p = ranges[i]; p < ranges[i + 1]; p++) positions.push(p);
    }
    return positions;
}

/**
 * Fuzzy-rank the round's cells against `query`. An empty query lists the first
 * cells unranked so the palette shows content the instant it opens.
 *
 * ponytail: recollects cells and searches every call. A flow is a few hundred
 * short cells, so this is trivial; memoize on round identity if flows ever get
 * huge.
 */
export function searchCells(round: FlowRound, query: string): CellHit[] {
    const cells = collectCells(round);
    const q = query.trim();
    if (!q) return cells.slice(0, MAX_RESULTS).map((c) => ({ ...c, positions: [] }));

    const haystack = cells.map((c) => c.text);
    const idxs = uf.filter(haystack, q);
    if (!idxs || idxs.length === 0) return [];
    const info = uf.info(idxs, haystack, q);
    const order = uf.sort(info, haystack, q);

    const hits: CellHit[] = [];
    for (let i = 0; i < order.length && hits.length < MAX_RESULTS; i++) {
        const infoIdx = order[i];
        hits.push({
            ...cells[info.idx[infoIdx]],
            positions: rangesToPositions(info.ranges[infoIdx]),
        });
    }
    return hits;
}
