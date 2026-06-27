import { type FontId, fontCssVar } from "./registry";

/**
 * Writes the chosen flow font's CSS variable onto `--font-flow` at the document
 * root. `.flow` (cells + inline editor) reads `var(--font-flow, …)`, so this is
 * the single point that switches the flow typeface. SSR-safe no-op.
 */
export function applyFlowFont(id: FontId): void {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--font-flow", fontCssVar(id));
}
