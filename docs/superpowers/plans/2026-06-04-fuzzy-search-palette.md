# Fuzzy Search Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the substring-only ⌘K Quick Switcher with a fuzzy search palette that finds sheet titles and any argument's text across the whole flow and jumps straight to it.

**Architecture:** A pure index builder flattens the round into sheet- and node-entry arrays plus parallel string haystacks. A thin wrapper around `@leeoniya/ufuzzy` ranks matches and returns highlight ranges. A rewritten `SearchPalette` component runs both searches synchronously per keystroke, renders grouped "Sheets" / "Arguments" sections, and composes existing store actions to navigate on select.

**Tech Stack:** Next.js, React, TypeScript, Zustand, Vitest + @testing-library/react, `@leeoniya/ufuzzy`.

---

## File Structure

- **Create** `src/lib/search/entries.ts` — pure `buildSearchEntries(round)`: flatten round → sheet/node entries + haystacks.
- **Create** `src/lib/search/entries.test.ts` — unit tests for the builder.
- **Create** `src/lib/search/fuzzy.ts` — singleton uFuzzy wrapper: `fuzzySearch()` + `toSegments()`.
- **Create** `src/lib/search/fuzzy.test.ts` — unit tests for ranking, ranges, segments.
- **Create** `src/components/SearchPalette.tsx` — rewritten palette (replaces `QuickSwitcher.tsx`).
- **Create** `src/components/SearchPalette.test.tsx` — component tests.
- **Delete** `src/components/QuickSwitcher.tsx`.
- **Modify** `src/components/Workspace.tsx:9,59` — import/render `SearchPalette` instead of `QuickSwitcher`.
- **Modify** `README.md` — update the ⌘K feature/keybinding wording.

Store actions (`setActiveSheet`, `setSelection`, `setMode`, `setQuickSwitcherOpen`) and the `quickSwitcherOpen` flag are reused unchanged. The ⌘K command wiring in `src/lib/commands/commands.ts:244` already calls `setQuickSwitcherOpen(true)` — no change needed.

---

## Task 1: Add the uFuzzy dependency

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install the library**

Run: `npm install @leeoniya/ufuzzy`
Expected: `package.json` gains `"@leeoniya/ufuzzy"` under `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Verify it imports**

Run: `node -e "import('@leeoniya/ufuzzy').then(m => console.log(typeof m.default))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(search): add @leeoniya/ufuzzy dependency"
```

---

## Task 2: Pure search-index builder (`entries.ts`)

**Files:**
- Create: `src/lib/search/entries.ts`
- Test: `src/lib/search/entries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSearchEntries } from "./entries";
import type { Round } from "@/lib/model/types";

function makeRound(): Round {
  const now = 0;
  return {
    id: "r1",
    createdAt: now,
    updatedAt: now,
    role: "aff",
    format: {
      id: "f1",
      name: "Test",
      speeches: [
        { id: "1ac", name: "1AC", side: "aff", seconds: 0 },
        { id: "1nc", name: "1NC", side: "neg", seconds: 0 },
      ],
      prepSeconds: { aff: 0, neg: 0 },
    },
    meta: {},
    scouting: {
      aff: { first: { first: "", last: "" }, second: { first: "", last: "" } },
      neg: { first: { first: "", last: "" }, second: { first: "", last: "" } },
    },
    sheets: [
      { id: "s1", title: "Topicality", group: "neg", order: 0, kind: "flow" },
      { id: "s2", title: "Case", group: "aff", order: 1, kind: "flow" },
    ],
    nodes: [
      { id: "n1", sheetId: "s1", speechId: "1nc", parentId: null, order: 0, text: "Plan not topical", statuses: [] },
      { id: "n2", sheetId: "s2", speechId: "1ac", parentId: null, order: 0, text: "Line one\nline two", statuses: [] },
      { id: "n3", sheetId: "s2", speechId: "1ac", parentId: null, order: 1, text: "   ", statuses: [] },
    ],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  };
}

describe("buildSearchEntries", () => {
  it("returns empty structures for a null round", () => {
    const r = buildSearchEntries(null);
    expect(r).toEqual({ sheetEntries: [], sheetHaystack: [], nodeEntries: [], nodeHaystack: [] });
  });

  it("builds sheet entries and a parallel title haystack", () => {
    const { sheetEntries, sheetHaystack } = buildSearchEntries(makeRound());
    expect(sheetEntries).toEqual([
      { sheetId: "s1", title: "Topicality" },
      { sheetId: "s2", title: "Case" },
    ]);
    expect(sheetHaystack).toEqual(["Topicality", "Case"]);
  });

  it("skips empty/whitespace-only nodes and collapses newlines", () => {
    const { nodeEntries, nodeHaystack } = buildSearchEntries(makeRound());
    expect(nodeEntries).toHaveLength(2);
    expect(nodeHaystack).toEqual(["Plan not topical", "Line one line two"]);
  });

  it("attaches sheet title and speech name to node entries", () => {
    const { nodeEntries } = buildSearchEntries(makeRound());
    expect(nodeEntries[0]).toMatchObject({
      nodeId: "n1",
      sheetId: "s1",
      speechId: "1nc",
      sheetTitle: "Topicality",
      speechName: "1NC",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/search/entries.test.ts`
Expected: FAIL — cannot find module `./entries`.

- [ ] **Step 3: Write the implementation**

```ts
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
    const speechName = speech ? (speech.group ? `${speech.group} ${speech.name}` : speech.name) : "";
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/search/entries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/entries.ts src/lib/search/entries.test.ts
git commit -m "feat(search): pure search-index builder"
```

---

## Task 3: uFuzzy wrapper (`fuzzy.ts`)

**Files:**
- Create: `src/lib/search/fuzzy.ts`
- Test: `src/lib/search/fuzzy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { fuzzySearch, toSegments } from "./fuzzy";

const haystack = ["Plan not topical", "Case overview", "Topicality shell"];

describe("fuzzySearch", () => {
  it("returns empty result for a blank query", () => {
    expect(fuzzySearch(haystack, "   ")).toEqual({ order: [], ranges: [] });
  });

  it("ranks matches and returns haystack indices", () => {
    const { order } = fuzzySearch(haystack, "topical");
    expect(order.length).toBeGreaterThan(0);
    // "Plan not topical" and "Topicality shell" both match the subsequence.
    expect(order).toContain(0);
    expect(order).toContain(2);
    expect(order).not.toContain(1);
  });

  it("returns a ranges array aligned to order", () => {
    const { order, ranges } = fuzzySearch(haystack, "case");
    expect(order).toEqual([1]);
    expect(ranges).toHaveLength(1);
    expect(Array.isArray(ranges[0])).toBe(true);
  });
});

describe("toSegments", () => {
  it("returns a single unmatched segment when there are no ranges", () => {
    expect(toSegments("hello", [])).toEqual([{ text: "hello", match: false }]);
  });

  it("splits text into matched and unmatched segments", () => {
    // ranges are flat [start, end] pairs; mark "ell".
    expect(toSegments("hello", [1, 4])).toEqual([
      { text: "h", match: false },
      { text: "ell", match: true },
      { text: "o", match: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/search/fuzzy.test.ts`
Expected: FAIL — cannot find module `./fuzzy`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/search/fuzzy.test.ts`
Expected: PASS (5 tests).

> Note: if the `"topical"` ranking test is flaky on exact index membership, keep the `toContain` assertions (membership, not position) as written — they verify the right rows match without over-asserting order.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/fuzzy.ts src/lib/search/fuzzy.test.ts
git commit -m "feat(search): uFuzzy wrapper with highlight segments"
```

---

## Task 4: SearchPalette component

**Files:**
- Create: `src/components/SearchPalette.tsx`
- Test: `src/components/SearchPalette.test.tsx`
- Delete: `src/components/QuickSwitcher.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * SearchPalette component tests. Uses the real Zustand store, reset per test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import SearchPalette from "./SearchPalette";

function resetStore() {
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: "normal",
    selection: null,
    quickSwitcherOpen: false,
    settingsOpen: false,
  });
}

/** Round with two sheets; one argument on the Disad sheet. */
function setupRound() {
  const store = useRoundStore.getState();
  store.createRound({ role: "aff", format: makeFormatByKey("policy"), meta: { opponent: "Opp" } });
  const caseId = store.addSheet({ title: "Case", group: "aff" });
  const daId = store.addSheet({ title: "Disad", group: "neg" });
  const speechId = useRoundStore.getState().round!.format.speeches[0].id;
  const nodeId = store.addNode({ sheetId: daId, speechId, parentId: null, text: "Economy collapse impact" });
  useRoundStore.getState().setQuickSwitcherOpen(true);
  return { caseId, daId, speechId, nodeId };
}

describe("SearchPalette", () => {
  beforeEach(() => resetStore());

  it("renders nothing when closed", () => {
    setupRound();
    useRoundStore.getState().setQuickSwitcherOpen(false);
    render(<SearchPalette />);
    expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
  });

  it("shows all sheets when the query is empty", () => {
    setupRound();
    render(<SearchPalette />);
    expect(screen.getByText("Case")).toBeInTheDocument();
    expect(screen.getByText("Disad")).toBeInTheDocument();
  });

  it("fuzzy-matches an argument and shows it under Arguments", async () => {
    setupRound();
    render(<SearchPalette />);
    await userEvent.type(screen.getByTestId("search-palette-input"), "econ");
    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.getByText(/Economy collapse impact/)).toBeInTheDocument();
  });

  it("selecting a sheet switches to it and closes", async () => {
    const { daId } = setupRound();
    render(<SearchPalette />);
    await userEvent.type(screen.getByTestId("search-palette-input"), "disad");
    await userEvent.keyboard("{Enter}");
    const s = useRoundStore.getState();
    expect(s.activeSheetId).toBe(daId);
    expect(s.quickSwitcherOpen).toBe(false);
  });

  it("selecting an argument switches, selects the node, and enters insert mode", async () => {
    const { daId, nodeId } = setupRound();
    render(<SearchPalette />);
    await userEvent.type(screen.getByTestId("search-palette-input"), "economy");
    await userEvent.keyboard("{Enter}");
    const s = useRoundStore.getState();
    expect(s.activeSheetId).toBe(daId);
    expect(s.selection?.nodeId).toBe(nodeId);
    expect(s.mode).toBe("insert");
    expect(s.quickSwitcherOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/SearchPalette.test.tsx`
Expected: FAIL — cannot find module `./SearchPalette`.

- [ ] **Step 3: Write the component**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { buildSearchEntries } from "@/lib/search/entries";
import { fuzzySearch, toSegments } from "@/lib/search/fuzzy";

/** Cap argument rows so a broad query never floods the DOM. */
const MAX_NODE_RESULTS = 50;

/** A flat, keyboard-navigable result row. */
type Row =
  | { kind: "sheet"; sheetId: string; title: string; ranges: number[] }
  | {
      kind: "node";
      nodeId: string;
      sheetId: string;
      speechId: string;
      text: string;
      crumb: string;
      ranges: number[];
    };

/** Renders text with matched character runs wrapped in <mark>. */
function Highlighted({ text, ranges }: { text: string; ranges: number[] }) {
  return (
    <>
      {toSegments(text, ranges).map((seg, i) =>
        seg.match ? (
          <mark key={i} className="bg-transparent font-semibold text-zinc-900">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

export default function SearchPalette() {
  const open = useRoundStore((s) => s.quickSwitcherOpen);
  const round = useRoundStore((s) => s.round);
  const setActiveSheet = useRoundStore((s) => s.setActiveSheet);
  const setSelection = useRoundStore((s) => s.setSelection);
  const setMode = useRoundStore((s) => s.setMode);
  const setOpen = useRoundStore((s) => s.setQuickSwitcherOpen);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // Rebuild the index only when the underlying data changes.
  const entries = useMemo(() => buildSearchEntries(round), [round?.sheets, round?.nodes]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();

    // Empty query: list all sheets, no arguments.
    if (!q) {
      return entries.sheetEntries.map((e) => ({
        kind: "sheet" as const,
        sheetId: e.sheetId,
        title: e.title,
        ranges: [],
      }));
    }

    const sheetRes = fuzzySearch(entries.sheetHaystack, q);
    const sheetRows: Row[] = sheetRes.order.map((idx, i) => {
      const e = entries.sheetEntries[idx];
      return { kind: "sheet", sheetId: e.sheetId, title: e.title, ranges: sheetRes.ranges[i] };
    });

    const nodeRes = fuzzySearch(entries.nodeHaystack, q);
    const nodeRows: Row[] = nodeRes.order.slice(0, MAX_NODE_RESULTS).map((idx, i) => {
      const e = entries.nodeEntries[idx];
      const crumb = e.speechName ? `${e.sheetTitle} · ${e.speechName}` : e.sheetTitle;
      return {
        kind: "node",
        nodeId: e.nodeId,
        sheetId: e.sheetId,
        speechId: e.speechId,
        text: e.text,
        crumb,
        ranges: nodeRes.ranges[i],
      };
    });

    return [...sheetRows, ...nodeRows];
  }, [entries, query]);

  // Keep selection in range as results change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const sheetRows = rows.filter((r) => r.kind === "sheet");
  const nodeRows = rows.filter((r) => r.kind === "node");

  function select(row: Row) {
    if (row.kind === "sheet") {
      setActiveSheet(row.sheetId);
    } else {
      setActiveSheet(row.sheetId);
      setSelection({ sheetId: row.sheetId, speechId: row.speechId, nodeId: row.nodeId });
      setMode("insert");
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");
    if (down) {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
      return;
    }
    if (up) {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const row = rows[selectedIndex];
      if (row) select(row);
    }
  }

  // Flat index of a row, used to mark the active row across both sections.
  const indexOf = (row: Row) => rows.indexOf(row);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 pt-[12vh]"
      onClick={() => setOpen(false)}
      data-testid="search-palette-overlay"
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Search flow"
        data-testid="search-palette"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sheets and arguments…"
          className="box-border w-full border-b border-none border-border bg-card px-3.5 py-3 text-[14px] text-zinc-900 focus:outline-none"
          data-testid="search-palette-input"
          aria-label="Search flow"
        />
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <div className="px-2.5 py-2 text-[13px] text-zinc-400">No results</div>
          ) : (
            <>
              {sheetRows.length > 0 && (
                <Section label="Sheets">
                  {sheetRows.map((row) => (
                    <RowButton
                      key={row.sheetId}
                      active={indexOf(row) === selectedIndex}
                      onClick={() => select(row)}
                      testId={`sp-sheet-${row.sheetId}`}
                    >
                      <Highlighted text={row.title} ranges={row.ranges} />
                    </RowButton>
                  ))}
                </Section>
              )}
              {nodeRows.length > 0 && (
                <Section label="Arguments">
                  {nodeRows.map((row) =>
                    row.kind === "node" ? (
                      <RowButton
                        key={row.nodeId}
                        active={indexOf(row) === selectedIndex}
                        onClick={() => select(row)}
                        testId={`sp-node-${row.nodeId}`}
                      >
                        <span className="block truncate">
                          <Highlighted text={row.text} ranges={row.ranges} />
                        </span>
                        <span className="block truncate text-[11px] text-zinc-400">{row.crumb}</span>
                      </RowButton>
                    ) : null,
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <ul className="m-0 list-none p-0">{children}</ul>
    </div>
  );
}

function RowButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className={`block w-full cursor-pointer rounded-md border-none px-2.5 py-2 text-left text-[13px] text-zinc-900 ${
          active ? "bg-zinc-100" : "bg-transparent hover:bg-zinc-50"
        }`}
        onClick={onClick}
        data-testid={testId}
      >
        {children}
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Wire it into Workspace and remove QuickSwitcher**

In `src/components/Workspace.tsx`, change the import on line 9:

```tsx
import SearchPalette from "./SearchPalette";
```

and the render on line 59 (inside the returned tree):

```tsx
<SearchPalette />
```

Then delete the old component:

```bash
git rm src/components/QuickSwitcher.tsx
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/components/SearchPalette.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/SearchPalette.tsx src/components/SearchPalette.test.tsx src/components/Workspace.tsx
git commit -m "feat(search): fuzzy search palette replacing quick switcher"
```

---

## Task 5: Update README wording

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Features list**

Replace the line:

```
- **Quick switcher** — ⌘K fuzzy sheet picker
```

with:

```
- **Fuzzy search** — ⌘K palette finds any sheet or argument across the flow
```

- [ ] **Step 2: Update the keybindings table**

Replace the table row:

```
| `⌘K`           | Quick switcher                                |
```

with:

```
| `⌘K`           | Fuzzy search (sheets + arguments)             |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(search): update README for fuzzy search palette"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (including the new search tests).

- [ ] **Step 2: Type-check / build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual smoke (optional)**

Run: `npm run dev`, open the app, press ⌘K, type a fragment of an argument, press Enter, and confirm it jumps to the right sheet/cell in edit mode.

---

## Self-Review Notes

- **Spec coverage:** scope (sheet titles + argument text) → Task 2; uFuzzy engine with typo tolerance → Task 1+3; grouped sections + highlighting + keyboard nav → Task 4; select behaviors (sheet switch vs. switch+select+insert) → Task 4 tests; empty-query sheets-only, whitespace handling, newline collapse, no-match state → Tasks 2 & 4; reveal-on-edit relies on existing `GridCell` focus (no new code); README → Task 5; dependency → Task 1.
- **Type consistency:** `SheetEntry`/`NodeEntry`/`SearchEntries` (Task 2), `FuzzyResult`/`Segment`/`fuzzySearch`/`toSegments` (Task 3) are used exactly as defined in Task 4. The `Row` union and `MAX_NODE_RESULTS` are local to the component.
- **No store changes:** reuses `setActiveSheet`, `setSelection`, `setMode`, `setQuickSwitcherOpen`, and the `quickSwitcherOpen` flag; ⌘K command wiring unchanged.
