/**
 * Font registry — single source of truth for the curated flow-font lineup.
 *
 * Each entry's `cssVar` is the CSS variable emitted by the matching
 * `next/font/local` declaration in `src/app/layout.tsx`. The selected flow
 * font is applied by writing one of these `cssVar` strings to `--font-flow`.
 */

export type FontId = "commit-mono" | "plex-mono" | "dm-sans" | "inter";
export type FontCategory = "mono" | "sans";

export interface FontOption {
    id: FontId;
    label: string;
    cssVar: string;
    category: FontCategory;
}

export const FONTS: FontOption[] = [
    {
        id: "commit-mono",
        label: "Commit Mono",
        cssVar: "var(--font-commit-mono)",
        category: "mono",
    },
    {
        id: "plex-mono",
        label: "IBM Plex Mono",
        cssVar: "var(--font-ibm-plex-mono)",
        category: "mono",
    },
    {
        id: "dm-sans",
        label: "DM Sans",
        cssVar: "var(--font-dm-sans)",
        category: "sans",
    },
    {
        id: "inter",
        label: "Inter",
        cssVar: "var(--font-inter)",
        category: "sans",
    },
];

export const DEFAULT_FONT_ID: FontId = "commit-mono";

const BY_ID: Record<FontId, FontOption> = Object.fromEntries(FONTS.map((f) => [f.id, f])) as Record<
    FontId,
    FontOption
>;

export function isFontId(value: unknown): value is FontId {
    return typeof value === "string" && value in BY_ID;
}

export function resolveFontId(value: unknown): FontId {
    return isFontId(value) ? value : DEFAULT_FONT_ID;
}

export function fontCssVar(id: FontId): string {
    return BY_ID[id].cssVar;
}
