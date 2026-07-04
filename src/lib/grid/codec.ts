/**
 * Maps between stored FlowSheet data/meta and Handsontable's runtime shape.
 * At runtime Handsontable cellMeta classNames are the truth for decorations;
 * this codec extracts them on save and injects them on load.
 */

import type { CellMeta } from "@/lib/model/flow";

export const BOLD_CLASS = "flow-bold";
export const HIGHLIGHT_CLASS = "flow-highlight";
export const CARD_CLASS = "flow-card";

export function metaToClassName(m: CellMeta | undefined): string {
    if (!m) return "";
    return [m.bold ? BOLD_CLASS : "", m.highlight ? HIGHLIGHT_CLASS : "", m.card ? CARD_CLASS : ""]
        .filter(Boolean)
        .join(" ");
}

export function classNameToMeta(cls: string): CellMeta | undefined {
    const tokens = cls.split(/\s+/);
    const bold = tokens.includes(BOLD_CLASS);
    const highlight = tokens.includes(HIGHLIGHT_CLASS);
    const card = tokens.includes(CARD_CLASS);
    if (!bold && !highlight && !card) return undefined;
    const meta: CellMeta = {};
    if (bold) meta.bold = true;
    if (highlight) meta.highlight = true;
    if (card) meta.card = true;
    return meta;
}

export function toggleClassToken(cls: string, token: string): string {
    const tokens = cls.split(/\s+/).filter(Boolean);
    return (tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token]).join(
        " ",
    );
}

const rowEmpty = (row: (string | null)[]) => row.every((c) => c == null || c === "");

/** Drops trailing all-empty rows so storage stays sparse. */
export function trimGrid(data: (string | null)[][]): (string | null)[][] {
    let end = data.length;
    while (end > 0 && rowEmpty(data[end - 1])) end--;
    return data.slice(0, end);
}

/** Fresh arrays sized rows x cols for loading into the grid. */
export function padGrid(
    data: (string | null)[][],
    cols: number,
    minRows: number,
): (string | null)[][] {
    const rows = Math.max(data.length, minRows);
    return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => data[r]?.[c] ?? null),
    );
}
