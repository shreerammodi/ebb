# Fuzzy Search Palette — Design

**Date:** 2026-06-04
**Status:** Approved, pending implementation

## Problem

The current ⌘K "Quick Switcher" (`src/components/QuickSwitcher.tsx`) only does a
plain substring `.includes()` filter over **sheet titles**. It cannot find an
argument by its text, which is the most common thing a debater needs to locate
mid-round ("where did I say X?"). We want a fast, fuzzy search palette that finds
text **anywhere in the flow** — both sheet titles and argument node text — and
jumps straight to it.

Speed is the headline requirement: results must feel instant on every keystroke.

## Goals

- Fuzzy search over **sheet titles** and **all argument text** in one query.
- Results grouped into **"Sheets"** and **"Arguments"** sections, each ranked.
- Selecting a sheet switches to it; selecting an argument switches to its sheet,
  selects the node, and enters edit (insert) mode.
- Keep the ⌘K binding; replace the existing Quick Switcher entirely.
- Lightning-fast: synchronous matching on each keystroke, no perceptible latency.

## Non-goals

- Searching speech/column names, scouting, or round metadata (decided out of scope).
- Persisting search history or recent results.
- Asynchronous indexing / web workers — unnecessary at expected flow sizes
  (a few hundred short strings).

## Matching engine

Use **`@leeoniya/ufuzzy`** (~7KB), a maintained, purpose-built fuzzy library —
rather than a hand-rolled scorer. Configured with `intraMode: 1` for single-typo
tolerance (Damerau–Levenshtein distance 1 per term).

Rationale: a solved problem with a battle-tested library; uFuzzy is fast, returns
match ranges for highlighting, and supports out-of-order terms.

## Architecture

### 1. `src/lib/search/entries.ts` — pure index builder

`buildSearchEntries(round)` flattens a `Round` into searchable entries:

- `sheetEntries: { sheetId: string; title: string }[]`
- `nodeEntries: { nodeId: string; sheetId: string; speechId: string; text: string;
  sheetTitle: string; speechName: string }[]` — only nodes with non-empty text;
  text is normalized to a single line (newlines collapsed to spaces) for display
  and matching.

Returns those plus parallel `string[]` haystacks (`sheetHaystack`,
`nodeHaystack`) aligned by index for uFuzzy. Pure and unit-testable.

### 2. `src/lib/search/fuzzy.ts` — uFuzzy wrapper

Holds one singleton `uFuzzy` instance. Exposes:

```ts
fuzzySearch(haystack: string[], query: string): { order: number[]; ranges: number[][] }
```

`order` is the ranked list of haystack indices; `ranges[i]` are the matched
character ranges for `order[i]` (for highlighting). A thin, swappable seam over
the library so the component never touches uFuzzy directly.

### 3. `src/components/SearchPalette.tsx` — rewritten component

Renamed from `QuickSwitcher.tsx`. Responsibilities:

- `useMemo` builds entries + haystacks, recomputed only when `round.sheets` or
  `round.nodes` change.
- On each keystroke, runs `fuzzySearch` over both haystacks synchronously
  (no debounce — keeps it instant).
- Renders two sections: **Sheets** then **Arguments**, each ranked. Matched
  characters highlighted with `<mark>`. Each argument row shows its (single-line)
  text plus a muted `sheetTitle · speechName` breadcrumb.
- A single `selectedIndex` walks the concatenated visible list (sheets then
  arguments). Keyboard: ↑/↓ and Ctrl+n/Ctrl+p move, Enter selects, Esc closes.
- **Empty / whitespace-only query** → show all sheets only (preserves today's
  "jump to sheet" behavior); show no argument rows (too many to be useful).

## Data flow on select

Composes existing store actions — **no store API changes**:

- **Sheet result:** `setActiveSheet(sheetId)` → close palette.
- **Argument result:** `setActiveSheet(sheetId)` →
  `setSelection({ sheetId, speechId, nodeId })` → `setMode("insert")` →
  close palette.

**Reveal:** verify during implementation whether selecting a node already scrolls
the cell into view in `FlowGrid`/`GridCell`. If not, add a `scrollIntoView` on the
selected cell so the target is visible after a jump.

The store flag `quickSwitcherOpen` (and its setter `setQuickSwitcherOpen`) is kept
as-is to avoid unnecessary churn.

## Edge cases

- Null / empty round → palette renders nothing gracefully.
- Whitespace-only query → treated as empty (sheets-only view).
- Node text with newlines → collapsed to a single line for display and matching.
- No matches → "No results" message per the existing empty-state pattern.

## Testing

- **`entries.test.ts`** — flattening correctness: excludes empty-text nodes,
  collapses newlines, attaches correct sheet/speech labels, aligned haystacks.
- **`fuzzy.test.ts`** — ranking order, returned ranges, single-typo tolerance.
- **`SearchPalette.test.tsx`** — mirrors existing QuickSwitcher tests: open, type,
  grouped results render, keyboard navigation, and the two select behaviors
  (sheet switch vs. argument switch + select + insert mode).

## Dependency

Add `@leeoniya/ufuzzy`.

## Rollout

Replace `QuickSwitcher.tsx` with `SearchPalette.tsx`; update `AppRoot` wiring,
component tests, and README wording (the ⌘K "Quick switcher" line becomes a fuzzy
search palette).
