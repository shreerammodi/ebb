# Flows Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Flows Dashboard as the app's landing screen — a searchable, sortable grid of scouting-summary cards for every saved round, with per-flow + bulk import/export, soft-delete to a Trash route, and access to Settings.

**Architecture:** Three sequential layers. (1) Persistence/data: a `deletedAt` soft-delete field, an extended `RoundSummary`, a separate Dexie `searchIndex` table, and backup envelope import/export. (2) Dashboard UI at `/` (cards, fuzzy search, sort + group-by-tournament, kebab actions, detail drawer, new-flow, import/export) plus query-param routing (`/flow?id=`). (3) Trash route + empty state, retiring `RoundSetup`.

**Tech Stack:** Next.js 15 (static export), React 19, TypeScript, Zustand, Dexie/IndexedDB, `@leeoniya/ufuzzy`, Radix UI, Tailwind v4, Vitest + Testing Library + `fake-indexeddb`. New dep: `sonner` (toasts).

**Spec:** `docs/superpowers/specs/2026-06-06-flows-dashboard-design.md`

**Conventions for every task:**
- Run a single test file with: `npx vitest run <path>` (watch mode is `npm run test:watch`).
- Commit messages omit any Claude/Anthropic attribution trailer.
- After each task: `npx vitest run` (full suite) should stay green before committing.

---

## PHASE 1 — Data layer

### Task 1: `Round.deletedAt` field + normalize preserves it

**Files:**
- Modify: `src/lib/model/types.ts`
- Modify: `src/lib/model/normalize.ts`
- Test: `src/lib/model/normalize.test.ts`

- [ ] **Step 1: Add the field to the `Round` interface**

In `src/lib/model/types.ts`, inside `export interface Round`, add after `updatedAt: number;`:

```ts
  /** ms timestamp when soft-deleted (moved to Trash); absent/null = live. */
  deletedAt?: number | null;
```

- [ ] **Step 2: Write the failing test**

Append to `src/lib/model/normalize.test.ts`:

```ts
describe("normalizeRound deletedAt", () => {
  it("preserves a deletedAt timestamp", () => {
    const raw = {
      id: "r1",
      createdAt: 1,
      updatedAt: 2,
      deletedAt: 1234,
      role: "aff",
      format: { id: "f", name: "T", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
      scouting: emptyScouting(),
      sheets: [],
      nodes: [],
      groups: [],
      timers: {
        activeSpeechId: null,
        speechRemaining: null,
        running: false,
        prepRemaining: { aff: 240, neg: 240 },
        prepRunning: null,
      },
    } as unknown as Round;
    expect(normalizeRound(raw).deletedAt).toBe(1234);
  });

  it("leaves deletedAt undefined for a live round", () => {
    const raw = {
      id: "r2",
      createdAt: 1,
      updatedAt: 2,
      role: "aff",
      format: { id: "f", name: "T", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
      scouting: emptyScouting(),
      sheets: [],
      nodes: [],
      groups: [],
      timers: {
        activeSpeechId: null,
        speechRemaining: null,
        running: false,
        prepRemaining: { aff: 240, neg: 240 },
        prepRunning: null,
      },
    } as unknown as Round;
    expect(normalizeRound(raw).deletedAt ?? null).toBeNull();
  });
});
```

Ensure the test file imports `emptyScouting` and `Round`:

```ts
import { normalizeRound, emptyScouting } from "./normalize";
import type { Round } from "./types";
```

(Only add imports that aren't already present.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/model/normalize.test.ts`
Expected: the first test FAILS (`deletedAt` is dropped — `normalizeRound` spreads `raw` so it likely already passes; if it passes, that is acceptable — the second case is the real guard). If both pass already, proceed; the field spreads through `{ ...raw }`.

- [ ] **Step 4: Confirm `normalizeRound` keeps the field**

`normalizeRound` starts with `const r = { ...raw }`, so `deletedAt` already carries through. No code change needed beyond the type. If the test fails, ensure nothing deletes `r.deletedAt`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/model/normalize.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/model/types.ts src/lib/model/normalize.test.ts
git commit -m "feat(model): add Round.deletedAt soft-delete field"
```

---

### Task 2: Dexie schema bump — `deletedAt` index + `searchIndex` table

**Files:**
- Modify: `src/lib/persistence/db.ts`
- Test: `src/lib/persistence/db.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/persistence/db.test.ts`:

```ts
describe("IndexedDB v5 schema", () => {
  it("exposes a searchIndex table and keeps rounds", async () => {
    const DB_NAME = "debateflow-v5-schema-test";
    const db = new DebateFlowDB(DB_NAME);
    await db.searchIndex.put({ id: "r1", searchText: "hello world" });
    const row = await db.searchIndex.get("r1");
    expect(row?.searchText).toBe("hello world");
    expect(db.rounds).toBeDefined();
    await db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/persistence/db.test.ts`
Expected: FAIL — `db.searchIndex` is undefined.

- [ ] **Step 3: Add the table + index + type**

In `src/lib/persistence/db.ts`:

Add an interface near the top (after imports):

```ts
/** A precomputed fuzzy-search haystack for one round (scouting + all node text). */
export interface SearchIndexRow {
  id: string;
  searchText: string;
}
```

Add the table field to the class:

```ts
export class DebateFlowDB extends Dexie {
  rounds!: EntityTable<Round, "id">;
  searchIndex!: EntityTable<SearchIndexRow, "id">;
```

Add a version 5 at the end of the constructor (after the `version(4)` block):

```ts
    this.version(5).stores({
      // Re-declare rounds to add the deletedAt index; add the searchIndex table.
      rounds: "id, updatedAt, deletedAt",
      searchIndex: "id",
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/persistence/db.test.ts`
Expected: PASS (all migration tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/persistence/db.ts src/lib/persistence/db.test.ts
git commit -m "feat(db): v5 schema — deletedAt index + searchIndex table"
```

---

### Task 3: `buildSummary` — derive `RoundSummary` from a round

**Files:**
- Create: `src/lib/dashboard/summary.ts`
- Test: `src/lib/dashboard/summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dashboard/summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSummary } from "./summary";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function baseRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "r1",
    createdAt: 10,
    updatedAt: 20,
    role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: emptyScouting(),
    sheets: [],
    nodes: [],
    groups: [],
    timers: {
      activeSpeechId: null,
      speechRemaining: null,
      running: false,
      prepRemaining: { aff: 240, neg: 240 },
      prepRunning: null,
    },
    ...overrides,
  };
}

describe("buildSummary", () => {
  it("derives team codes from scouting schools + debaters", () => {
    const r = baseRound({
      scouting: {
        ...emptyScouting(),
        affSchool: "Westwood",
        negSchool: "Harvard",
        aff: { first: { first: "A", last: "Gold" }, second: { first: "B", last: "Mehta" } },
        neg: { first: { first: "C", last: "Smith" }, second: { first: "D", last: "Brown" } },
        tournament: "Berkeley",
        round: "Round 3",
        judge: "K. Strange",
      },
    });
    const s = buildSummary(r);
    expect(s.affTeam).toBe("Westwood GM");
    expect(s.negTeam).toBe("Harvard BS");
    expect(s.tournament).toBe("Berkeley");
    expect(s.round).toBe("Round 3");
    expect(s.judge).toBe("K. Strange");
    expect(s.id).toBe("r1");
    expect(s.role).toBe("aff");
    expect(s.updatedAt).toBe(20);
  });

  it("returns empty team strings when scouting is blank", () => {
    const s = buildSummary(baseRound());
    expect(s.affTeam).toBe("");
    expect(s.negTeam).toBe("");
    expect(s.tournament).toBeUndefined();
  });

  it("passes through the decision", () => {
    const r = baseRound({
      scouting: { ...emptyScouting(), decision: { vote: "neg", rfd: "clear neg" } },
    });
    expect(buildSummary(r).decision).toEqual({ vote: "neg", rfd: "clear neg" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard/summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `summary.ts`**

Create `src/lib/dashboard/summary.ts`:

```ts
import type { Round, Role, Decision } from "@/lib/model/types";
import { teamCode } from "@/lib/model/teamCode";

/** Lightweight per-flow summary for the dashboard grid (no node loading). */
export interface RoundSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  role: Role;
  /** teamCode(affSchool, 1A, 2A); "" when unscouted. */
  affTeam: string;
  /** teamCode(negSchool, 1N, 2N); "" when unscouted. */
  negTeam: string;
  tournament?: string;
  round?: string;
  date?: string;
  judge?: string;
  decision?: Decision;
}

/** Derive a RoundSummary from a full round. */
export function buildSummary(round: Round): RoundSummary {
  const sc = round.scouting;
  return {
    id: round.id,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    role: round.role,
    affTeam: teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second),
    negTeam: teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second),
    tournament: sc.tournament,
    round: sc.round,
    date: sc.date,
    judge: sc.judge,
    decision: sc.decision,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard/summary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/summary.ts src/lib/dashboard/summary.test.ts
git commit -m "feat(dashboard): buildSummary derives RoundSummary from a round"
```

---

### Task 4: `searchIndex` — build searchText + table CRUD

**Files:**
- Create: `src/lib/persistence/searchIndex.ts`
- Test: `src/lib/persistence/searchIndex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/persistence/searchIndex.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { buildSearchText, writeSearchIndex, deleteSearchIndex } from "./searchIndex";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: "r1",
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: { ...emptyScouting(), affSchool: "Westwood", tournament: "Berkeley" },
    sheets: [],
    nodes: [
      { id: "n1", sheetId: "s", speechId: "1ac", parentId: null, order: 0, text: "perm do both", statuses: [], bold: false },
    ],
    groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
    ...overrides,
  };
}

beforeEach(async () => {
  await db.searchIndex.clear();
});

describe("buildSearchText", () => {
  it("includes scouting fields and all node text, lowercased", () => {
    const text = buildSearchText(round());
    expect(text).toContain("westwood");
    expect(text).toContain("berkeley");
    expect(text).toContain("perm do both");
  });
});

describe("searchIndex CRUD", () => {
  it("writes and deletes a row", async () => {
    await writeSearchIndex(round());
    expect((await db.searchIndex.get("r1"))?.searchText).toContain("perm do both");
    await deleteSearchIndex("r1");
    expect(await db.searchIndex.get("r1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/persistence/searchIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `searchIndex.ts`**

Create `src/lib/persistence/searchIndex.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/persistence/searchIndex.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/persistence/searchIndex.ts src/lib/persistence/searchIndex.test.ts
git commit -m "feat(persistence): searchIndex builder + table CRUD"
```

---

### Task 5: autosave wiring — extended summaries, soft delete, trash, index sync

**Files:**
- Modify: `src/lib/persistence/autosave.ts`
- Test: `src/lib/persistence/autosave.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/persistence/autosave.test.ts` (keep existing imports; add any missing):

```ts
import {
  persistRound,
  listRounds,
  listTrash,
  softDeleteRound,
  restoreRound,
  deleteRoundForever,
  loadLastRound,
} from "./autosave";
import { db } from "./db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mkRound(id: string, over: Partial<Round> = {}): Round {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: { ...emptyScouting(), affSchool: "Westwood" },
    sheets: [],
    nodes: [{ id: "n", sheetId: "s", speechId: "1ac", parentId: null, order: 0, text: "kritik", statuses: [], bold: false }],
    groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
    ...over,
  };
}

describe("autosave soft-delete + summaries", () => {
  beforeEach(async () => {
    await db.rounds.clear();
    await db.searchIndex.clear();
  });

  it("persistRound writes a search index row", async () => {
    await persistRound(mkRound("a"));
    expect((await db.searchIndex.get("a"))?.searchText).toContain("kritik");
  });

  it("listRounds returns extended summaries and excludes trashed", async () => {
    await persistRound(mkRound("a", { updatedAt: 2 }));
    await persistRound(mkRound("b", { updatedAt: 5, deletedAt: 1234 }));
    const live = await listRounds();
    expect(live.map((s) => s.id)).toEqual(["a"]);
    expect(live[0].affTeam).toBe("Westwood AA"); // school + single-initial fallback
  });

  it("softDeleteRound + listTrash + restore + deleteForever", async () => {
    await persistRound(mkRound("a"));
    await softDeleteRound("a");
    expect((await listRounds()).length).toBe(0);
    expect((await listTrash()).map((s) => s.id)).toEqual(["a"]);

    await restoreRound("a");
    expect((await listRounds()).map((s) => s.id)).toEqual(["a"]);
    expect((await listTrash()).length).toBe(0);

    await deleteRoundForever("a");
    expect(await db.rounds.get("a")).toBeUndefined();
    expect(await db.searchIndex.get("a")).toBeUndefined();
  });

  it("loadLastRound skips trashed flows", async () => {
    await persistRound(mkRound("a", { updatedAt: 2 }));
    await persistRound(mkRound("b", { updatedAt: 9, deletedAt: 1 }));
    expect((await loadLastRound())?.id).toBe("a");
  });
});
```

> Note: `mkRound("a")` has `affSchool: "Westwood"` and the default `emptyScouting()` debaters have blank names, so `teamCode` returns just the school. The test asserts `"Westwood AA"` only if a debater has a name — adjust: with blank debaters `teamCode` returns `"Westwood"`. **Use `expect(live[0].affTeam).toBe("Westwood")`.**

Fix that assertion to:

```ts
    expect(live[0].affTeam).toBe("Westwood");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/persistence/autosave.test.ts`
Expected: FAIL — `listTrash`/`softDeleteRound`/etc. not exported.

- [ ] **Step 3: Implement the changes**

In `src/lib/persistence/autosave.ts`:

Replace the `RoundSummary` interface + `persistRound` + `listRounds` + `deleteRound` + `loadLastRound` region with:

```ts
import { db } from "./db";
import type { Round } from "@/lib/model/types";
import type { RoundStore } from "@/lib/store/useRoundStore";
import type { StoreApi } from "zustand";
import { normalizeRound } from "@/lib/model/normalize";
import { buildSummary, type RoundSummary } from "@/lib/dashboard/summary";
import { writeSearchIndex, deleteSearchIndex } from "./searchIndex";

export type { RoundSummary };

/** Persist (insert or update) a round and refresh its search index row. */
export async function persistRound(round: Round): Promise<void> {
  await db.rounds.put(round);
  await writeSearchIndex(round);
}

/** Load a single round by id. Returns undefined if not found. */
export async function loadRound(id: string): Promise<Round | undefined> {
  const r = await db.rounds.get(id);
  return r ? normalizeRound(r) : undefined;
}

/** Live (non-trashed) round summaries, most-recently-updated first. */
export async function listRounds(): Promise<RoundSummary[]> {
  const rounds = await db.rounds.orderBy("updatedAt").reverse().toArray();
  return rounds.filter((r) => r.deletedAt == null).map(buildSummary);
}

/** Trashed round summaries, most-recently-updated first. */
export async function listTrash(): Promise<RoundSummary[]> {
  const rounds = await db.rounds.orderBy("updatedAt").reverse().toArray();
  return rounds.filter((r) => r.deletedAt != null).map(buildSummary);
}

/** Move a round to Trash (soft delete). */
export async function softDeleteRound(id: string): Promise<void> {
  await db.rounds.update(id, { deletedAt: Date.now() });
}

/** Restore a trashed round. */
export async function restoreRound(id: string): Promise<void> {
  await db.rounds.update(id, { deletedAt: null });
}

/** Permanently delete a round and its search index row. */
export async function deleteRoundForever(id: string): Promise<void> {
  await db.rounds.delete(id);
  await deleteSearchIndex(id);
}

/** Most-recently-updated LIVE round, normalized; undefined if none. */
export async function loadLastRound(): Promise<Round | undefined> {
  const rounds = await db.rounds.orderBy("updatedAt").reverse().toArray();
  const live = rounds.find((r) => r.deletedAt == null);
  return live ? normalizeRound(live) : undefined;
}
```

> This removes the old `deleteRound`. Search the codebase for `deleteRound(` callers (`git grep "deleteRound"`) and repoint them to `softDeleteRound`. Keep `attachAutosave` below unchanged except that it now relies on `persistRound` (which also writes the index — fine).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/persistence/autosave.test.ts`
Expected: PASS

- [ ] **Step 5: Backfill migration for existing rounds' search index**

Existing rounds (created before v5) have no `searchIndex` rows. Add a lazy backfill helper to `searchIndex.ts`:

```ts
/** Build any missing search index rows from stored rounds. Safe to call repeatedly. */
export async function backfillSearchIndex(): Promise<void> {
  const [rounds, rows] = await Promise.all([db.rounds.toArray(), db.searchIndex.toArray()]);
  const have = new Set(rows.map((r) => r.id));
  const missing = rounds.filter((r) => !have.has(r.id));
  if (missing.length === 0) return;
  await db.searchIndex.bulkPut(missing.map((r) => ({ id: r.id, searchText: buildSearchText(r) })));
}
```

Add a test in `searchIndex.test.ts`:

```ts
describe("backfillSearchIndex", () => {
  it("creates rows only for rounds missing one", async () => {
    await db.rounds.clear();
    await db.rounds.put(round({ id: "x" }));
    await db.searchIndex.clear();
    const { backfillSearchIndex } = await import("./searchIndex");
    await backfillSearchIndex();
    expect((await db.searchIndex.get("x"))?.searchText).toContain("perm do both");
  });
});
```

Run: `npx vitest run src/lib/persistence/searchIndex.test.ts` → PASS

- [ ] **Step 6: Run full suite + commit**

Run: `npx vitest run`
Expected: PASS (fix any repointed `deleteRound` callers first).

```bash
git add src/lib/persistence/autosave.ts src/lib/persistence/autosave.test.ts src/lib/persistence/searchIndex.ts src/lib/persistence/searchIndex.test.ts
git commit -m "feat(persistence): extended summaries, soft delete, trash, index sync + backfill"
```

---

### Task 6: backup envelope + fresh-id import

**Files:**
- Create: `src/lib/persistence/backup.ts`
- Modify: `src/lib/persistence/io.ts`
- Test: `src/lib/persistence/backup.test.ts`
- Test: `src/lib/persistence/io.test.ts`

- [ ] **Step 1: Write the failing import test (fresh id)**

Append to `src/lib/persistence/io.test.ts`:

```ts
describe("importRoundJSON assigns a fresh identity", () => {
  it("changes id, refreshes createdAt, clears deletedAt", () => {
    const original = {
      version: 2,
      round: {
        id: "orig-id",
        createdAt: 100,
        updatedAt: 100,
        deletedAt: 555,
        role: "aff",
        format: { id: "f", name: "T", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
        scouting: { aff: { first: { first: "", last: "" }, second: { first: "", last: "" } }, neg: { first: { first: "", last: "" }, second: { first: "", last: "" } } },
        sheets: [],
        nodes: [],
        groups: [],
        timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
      },
    };
    const r = importRoundJSON(JSON.stringify(original));
    expect(r.id).not.toBe("orig-id");
    expect(r.deletedAt ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/persistence/io.test.ts`
Expected: FAIL — `r.id` still `"orig-id"`.

- [ ] **Step 3: Make `importRoundJSON` reassign identity**

In `src/lib/persistence/io.ts`, add an import:

```ts
import { uid } from "@/lib/model/ids";
```

Change the final `return normalizeRound(round as Round);` to:

```ts
  const normalized = normalizeRound(round as Round);
  const now = Date.now();
  return { ...normalized, id: uid("round"), createdAt: now, updatedAt: now, deletedAt: null };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/persistence/io.test.ts`
Expected: PASS

- [ ] **Step 5: Write the backup test**

Create `src/lib/persistence/backup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { exportBackupJSON, parseImportFile } from "./backup";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "T", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: emptyScouting(), sheets: [], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

describe("backup", () => {
  it("round-trips: export-all then parse yields N rounds with fresh ids", () => {
    const json = exportBackupJSON([mk("a"), mk("b")]);
    const rounds = parseImportFile(json);
    expect(rounds).toHaveLength(2);
    expect(rounds.map((r) => r.id)).not.toContain("a");
    expect(rounds.map((r) => r.id)).not.toContain("b");
  });

  it("parses a single-flow file into a 1-element array", () => {
    const single = JSON.stringify({ version: 2, round: mk("solo") });
    expect(parseImportFile(single)).toHaveLength(1);
  });

  it("throws on garbage", () => {
    expect(() => parseImportFile("not json")).toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/persistence/backup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `backup.ts`**

Create `src/lib/persistence/backup.ts`:

```ts
import type { Round } from "@/lib/model/types";
import { FILE_VERSION, importRoundJSON } from "./io";
import { normalizeRound } from "@/lib/model/normalize";
import { uid } from "@/lib/model/ids";

interface BackupEnvelope {
  version: number;
  kind: "backup";
  rounds: Round[];
}

/** Serialize many rounds as one backup file. */
export function exportBackupJSON(rounds: Round[]): string {
  const envelope: BackupEnvelope = { version: FILE_VERSION, kind: "backup", rounds };
  return JSON.stringify(envelope, null, 2);
}

/** Give an imported round a fresh identity (never clobbers, never trashed). */
function freshen(round: Round): Round {
  const normalized = normalizeRound(round);
  const now = Date.now();
  return { ...normalized, id: uid("round"), createdAt: now, updatedAt: now, deletedAt: null };
}

/**
 * Parse an import file that is EITHER a single-flow `{version, round}` OR a
 * backup `{version, kind:"backup", rounds:[]}`. Returns rounds with fresh ids.
 * Throws on invalid input.
 */
export function parseImportFile(text: string): Round[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid file");
  }
  const env = parsed as Record<string, unknown>;
  if (env.kind === "backup") {
    if (!Array.isArray(env.rounds)) throw new Error("Invalid backup file");
    return (env.rounds as Round[]).map(freshen);
  }
  // Single-flow path reuses importRoundJSON (which already freshens identity).
  return [importRoundJSON(text)];
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/lib/persistence/backup.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/persistence/backup.ts src/lib/persistence/backup.test.ts src/lib/persistence/io.ts src/lib/persistence/io.test.ts
git commit -m "feat(persistence): backup envelope + fresh-id import"
```

---

## PHASE 2 — Dashboard UI + routing

### Task 7: shared export helper + `sonner` toast + sheet primitive

**Files:**
- Create: `src/lib/export/run.ts`
- Test: `src/lib/export/run.test.ts`
- Modify: `package.json` (add `sonner`)
- Create: `src/components/ui/sheet.tsx`
- Modify: `src/app/layout.tsx` (mount `<Toaster />`)

- [ ] **Step 1: Write the failing test for the export helper**

Create `src/lib/export/run.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/persistence/io", () => ({ downloadRoundFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({ downloadXlsx: vi.fn() }));

import { runExport } from "./run";
import { downloadRoundFile } from "@/lib/persistence/io";
import { downloadXlsx } from "@/lib/export/xlsx";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

const round = {
  id: "r", createdAt: 1, updatedAt: 1, role: "aff",
  format: { id: "f", name: "T", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
  scouting: emptyScouting(), sheets: [], nodes: [], groups: [],
  timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
} as Round;

describe("runExport", () => {
  it("routes json → downloadRoundFile", async () => {
    await runExport(round, { autoNumber: true }, "json");
    expect(downloadRoundFile).toHaveBeenCalledWith(round);
  });
  it("routes excel → downloadXlsx", async () => {
    await runExport(round, { autoNumber: false }, "excel");
    expect(downloadXlsx).toHaveBeenCalledWith(round, { autoNumber: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/export/run.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `run.ts`**

Create `src/lib/export/run.ts`:

```ts
import type { Round } from "@/lib/model/types";
import type { ExportOptions } from "./options";
import { downloadRoundFile } from "@/lib/persistence/io";
import { downloadXlsx } from "./xlsx";

export type ExportFormat = "json" | "excel";

/** Run a per-round export in the requested format. */
export async function runExport(
  round: Round,
  opts: ExportOptions,
  fmt: ExportFormat,
): Promise<void> {
  if (fmt === "json") {
    downloadRoundFile(round);
    return;
  }
  await downloadXlsx(round, opts);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/export/run.test.ts`
Expected: PASS

- [ ] **Step 5: Add `sonner` + mount the Toaster**

Run: `npm install sonner`

In `src/app/layout.tsx`, import and render the toaster inside `<body>` after `{children}`:

```tsx
import { Toaster } from "sonner";
```
```tsx
      <body className="font-sans antialiased">
        {children}
        <Toaster position="bottom-center" />
      </body>
```

- [ ] **Step 6: Add a `sheet` (right-side drawer) primitive**

Create `src/components/ui/sheet.tsx` (Radix Dialog styled as a right-side panel; mirrors the existing `dialog.tsx` patterns):

```tsx
"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn("fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out", className)}
      {...props}
    />
  );
}

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col gap-0 overflow-y-auto border-l border-border bg-card p-0 shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
```

> If `radix-ui`'s `Dialog` export path differs from `dialog.tsx`, mirror exactly how `src/components/ui/dialog.tsx` imports it.

- [ ] **Step 7: Run full suite + commit**

Run: `npx vitest run`
Expected: PASS

```bash
git add src/lib/export/run.ts src/lib/export/run.test.ts src/components/ui/sheet.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat(ui): shared export helper, sonner toasts, sheet primitive"
```

---

### Task 8: `FlowCard` component (card B)

**Files:**
- Create: `src/components/dashboard/format.ts` (relative-time + result helpers)
- Test: `src/components/dashboard/format.test.ts`
- Create: `src/components/dashboard/FlowCard.tsx`
- Test: `src/components/dashboard/FlowCard.test.tsx`

- [ ] **Step 1: Write the failing test for formatters**

Create `src/components/dashboard/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { relativeTime, resultLabel } from "./format";

describe("relativeTime", () => {
  it("formats recent times", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 60_000, now)).toMatch(/min/);
    expect(relativeTime(now - 2 * 3600_000, now)).toMatch(/h/);
  });
});

describe("resultLabel", () => {
  it("labels a vote", () => {
    expect(resultLabel({ vote: "aff" })).toEqual({ text: "Aff", side: "aff" });
    expect(resultLabel({ vote: "neg" })).toEqual({ text: "Neg", side: "neg" });
  });
  it("labels undecided", () => {
    expect(resultLabel(undefined)).toEqual({ text: "undecided", side: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `format.ts`**

Create `src/components/dashboard/format.ts`:

```ts
import type { Decision, Side } from "@/lib/model/types";

/** Compact relative time like "2h ago", "3d ago", "just now". */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export interface ResultLabel {
  text: string;
  side: Side | null;
}

/** Map a decision to a colored result label. */
export function resultLabel(decision: Decision | undefined): ResultLabel {
  if (!decision?.vote) return { text: "undecided", side: null };
  return { text: decision.vote === "aff" ? "Aff" : "Neg", side: decision.vote };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/format.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing FlowCard test**

Create `src/components/dashboard/FlowCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowCard from "./FlowCard";
import type { RoundSummary } from "@/lib/dashboard/summary";

function summary(over: Partial<RoundSummary> = {}): RoundSummary {
  return {
    id: "r1", createdAt: 1, updatedAt: 2, role: "aff",
    affTeam: "Westwood GM", negTeam: "Harvard BS",
    tournament: "Berkeley", round: "Round 3", judge: "K. Strange",
    decision: { vote: "aff" }, ...over,
  };
}

describe("FlowCard", () => {
  it("shows matchup, scouting rows, and result", () => {
    render(<FlowCard summary={summary()} onOpen={() => {}} />);
    expect(screen.getByText("Westwood GM")).toBeInTheDocument();
    expect(screen.getByText("Harvard BS")).toBeInTheDocument();
    expect(screen.getByText("Berkeley")).toBeInTheDocument();
    expect(screen.getByText("Aff")).toBeInTheDocument();
  });

  it("falls back gracefully when unscouted", () => {
    render(<FlowCard summary={summary({ affTeam: "", negTeam: "Lincoln PK", tournament: undefined, judge: undefined, decision: undefined })} onOpen={() => {}} />);
    expect(screen.getByText(/Untitled Aff/)).toBeInTheDocument();
    expect(screen.getByText("undecided")).toBeInTheDocument();
  });

  it("calls onOpen when the card body is clicked", async () => {
    const onOpen = vi.fn();
    render(<FlowCard summary={summary()} onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId("flow-card-r1"));
    expect(onOpen).toHaveBeenCalledWith("r1");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/FlowCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `FlowCard.tsx`**

Create `src/components/dashboard/FlowCard.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { RoundSummary } from "@/lib/dashboard/summary";
import { relativeTime, resultLabel } from "./format";
import { toSegments } from "@/lib/search/fuzzy";
import { cn } from "@/lib/utils";

const rolePill: Record<RoundSummary["role"], { label: string; cls: string }> = {
  aff: { label: "Aff", cls: "bg-blue-50 text-blue-600" },
  neg: { label: "Neg", cls: "bg-red-50 text-red-600" },
  judge: { label: "Judge", cls: "bg-zinc-100 text-zinc-500" },
};

export interface FlowCardProps {
  summary: RoundSummary;
  onOpen: (id: string) => void;
  /** Optional kebab menu element rendered top-right. */
  menu?: React.ReactNode;
  /** Optional snippet (already segmented) shown when a content match exists. */
  snippet?: ReturnType<typeof toSegments> | null;
}

export default function FlowCard({ summary, onOpen, menu, snippet }: FlowCardProps) {
  const r = resultLabel(summary.decision);
  const edited = useMemo(() => relativeTime(summary.updatedAt), [summary.updatedAt]);
  const pill = rolePill[summary.role];

  const aff = summary.affTeam || "Untitled Aff";
  const neg = summary.negTeam || "Untitled Neg";
  const affBlank = !summary.affTeam;
  const negBlank = !summary.negTeam;

  return (
    <div
      data-testid={`flow-card-${summary.id}`}
      onClick={() => onOpen(summary.id)}
      className="group relative cursor-pointer rounded-xl border border-border bg-card p-5 transition hover:-translate-y-px hover:border-zinc-300 hover:shadow-md"
    >
      {menu}
      <div className="flex items-center justify-between gap-2">
        <span className="pr-7 text-[15px] font-semibold tracking-tight">
          <span className={cn(affBlank ? "text-zinc-400 italic" : "text-blue-600")}>{aff}</span>
          <span className="px-1.5 text-[13px] font-normal text-zinc-400">vs</span>
          <span className={cn(negBlank ? "text-zinc-400 italic" : "text-red-600")}>{neg}</span>
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase", pill.cls)}>
          {pill.label}
        </span>
      </div>

      <hr className="-mx-5 my-3 border-zinc-100" />

      <div className="grid grid-cols-[78px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        <span className="text-zinc-400">Tournament</span>
        <span className={summary.tournament ? "" : "text-zinc-400"}>{summary.tournament ?? "—"}</span>
        <span className="text-zinc-400">Round</span>
        <span className={summary.round ? "" : "text-zinc-400"}>{summary.round ?? "—"}</span>
        <span className="text-zinc-400">Judge</span>
        <span className={summary.judge ? "" : "text-zinc-400"}>{summary.judge ?? "—"}</span>
        <span className="text-zinc-400">Result</span>
        <span
          className={cn(
            "font-semibold",
            r.side === "aff" && "text-blue-600",
            r.side === "neg" && "text-red-600",
            r.side === null && "font-normal text-zinc-400",
          )}
        >
          {r.text}
        </span>
      </div>

      {snippet && (
        <p className="mt-3 line-clamp-2 text-[12px] text-zinc-500">
          {snippet.map((seg, i) => (
            <span key={i} className={seg.match ? "bg-yellow-100 font-medium text-zinc-800" : ""}>
              {seg.text}
            </span>
          ))}
        </p>
      )}

      <hr className="-mx-5 my-3 border-zinc-100" />
      <div className="text-[12px] text-zinc-500">edited {edited}</div>
    </div>
  );
}
```

> Tailwind v4: `blue-50/600` and `red-50/600` are stock palette. If the project restricts palette via theme tokens, swap to the existing `--aff`/`--neg`-style tokens used in `globals.css` (grep for `text-blue` / `aff` usage and match).

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/FlowCard.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/format.ts src/components/dashboard/format.test.ts src/components/dashboard/FlowCard.tsx src/components/dashboard/FlowCard.test.tsx
git commit -m "feat(dashboard): FlowCard (card B) + format helpers"
```

---

### Task 9: `useFlowList` hook — load + search + sort + group

**Files:**
- Create: `src/lib/dashboard/organize.ts` (pure sort/group/filter)
- Test: `src/lib/dashboard/organize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dashboard/organize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortSummaries, groupByTournament, type SortKey } from "./organize";
import type { RoundSummary } from "./summary";

function s(over: Partial<RoundSummary>): RoundSummary {
  return { id: "x", createdAt: 0, updatedAt: 0, role: "aff", affTeam: "", negTeam: "", ...over };
}

describe("sortSummaries", () => {
  const list = [
    s({ id: "a", updatedAt: 3, tournament: "Berkeley", date: "2026-01-02" }),
    s({ id: "b", updatedAt: 9, tournament: "Apple", date: "2026-03-01" }),
  ];
  it("sorts by last edited desc", () => {
    expect(sortSummaries(list, "updated").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("sorts by tournament asc", () => {
    expect(sortSummaries(list, "tournament").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("sorts by date desc", () => {
    expect(sortSummaries(list, "date").map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("groupByTournament", () => {
  it("groups and puts untitled last", () => {
    const groups = groupByTournament([
      s({ id: "a", tournament: "Berkeley" }),
      s({ id: "b" }),
      s({ id: "c", tournament: "Berkeley" }),
    ]);
    expect(groups[0].label).toBe("Berkeley");
    expect(groups[0].items.map((x) => x.id)).toEqual(["a", "c"]);
    expect(groups[groups.length - 1].label).toBe("No tournament");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/dashboard/organize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `organize.ts`**

Create `src/lib/dashboard/organize.ts`:

```ts
import type { RoundSummary } from "./summary";

export type SortKey = "updated" | "date" | "tournament" | "result";

/** Stable sort of summaries by the chosen key. */
export function sortSummaries(list: RoundSummary[], key: SortKey): RoundSummary[] {
  const copy = [...list];
  switch (key) {
    case "updated":
      return copy.sort((a, b) => b.updatedAt - a.updatedAt);
    case "date":
      return copy.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    case "tournament":
      return copy.sort((a, b) => (a.tournament ?? "~").localeCompare(b.tournament ?? "~"));
    case "result":
      return copy.sort((a, b) => (a.decision?.vote ?? "~").localeCompare(b.decision?.vote ?? "~"));
  }
}

export interface FlowGroup {
  label: string;
  items: RoundSummary[];
}

/** Group summaries under tournament headers; untitled flows go to a final "No tournament" group. */
export function groupByTournament(list: RoundSummary[]): FlowGroup[] {
  const byName = new Map<string, RoundSummary[]>();
  const untitled: RoundSummary[] = [];
  for (const s of list) {
    const t = s.tournament?.trim();
    if (!t) {
      untitled.push(s);
      continue;
    }
    if (!byName.has(t)) byName.set(t, []);
    byName.get(t)!.push(s);
  }
  const groups: FlowGroup[] = [...byName.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label, items: byName.get(label)! }));
  if (untitled.length) groups.push({ label: "No tournament", items: untitled });
  return groups;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/dashboard/organize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/organize.ts src/lib/dashboard/organize.test.ts
git commit -m "feat(dashboard): pure sort + group-by-tournament helpers"
```

---

### Task 10: search filter helper (summaries + content index)

**Files:**
- Create: `src/lib/dashboard/filter.ts`
- Test: `src/lib/dashboard/filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dashboard/filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterFlows } from "./filter";
import type { RoundSummary } from "./summary";

function s(id: string, over: Partial<RoundSummary> = {}): RoundSummary {
  return { id, createdAt: 0, updatedAt: 0, role: "aff", affTeam: "", negTeam: "", ...over };
}

const summaries = [
  s("a", { affTeam: "Westwood GM", tournament: "Berkeley" }),
  s("b", { affTeam: "Mission SK", tournament: "Glenbrooks" }),
];
const index = new Map<string, string>([
  ["a", "westwood gm berkeley perm do both"],
  ["b", "mission sk glenbrooks cap kritik"],
]);

describe("filterFlows", () => {
  it("returns all with a blank query", () => {
    expect(filterFlows(summaries, index, "").map((m) => m.summary.id)).toEqual(["a", "b"]);
  });
  it("matches on scouting fields", () => {
    const out = filterFlows(summaries, index, "berkeley");
    expect(out.map((m) => m.summary.id)).toEqual(["a"]);
  });
  it("matches on flow content and provides a snippet", () => {
    const out = filterFlows(summaries, index, "kritik");
    expect(out.map((m) => m.summary.id)).toEqual(["b"]);
    expect(out[0].snippet?.some((seg) => seg.match)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/dashboard/filter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `filter.ts`**

Create `src/lib/dashboard/filter.ts`:

```ts
import type { RoundSummary } from "./summary";
import { fuzzySearch, toSegments, type Segment } from "@/lib/search/fuzzy";

export interface FlowMatch {
  summary: RoundSummary;
  /** Segmented snippet from the content index when matched there; else null. */
  snippet: Segment[] | null;
}

const SNIPPET_RADIUS = 40;

/** Build a short snippet window around the first match range. */
function snippetFor(haystack: string, ranges: number[]): Segment[] | null {
  if (!ranges.length) return null;
  const start = Math.max(0, ranges[0] - SNIPPET_RADIUS);
  const end = Math.min(haystack.length, ranges[ranges.length - 1] + SNIPPET_RADIUS);
  const slice = haystack.slice(start, end);
  const shifted = ranges.map((r) => Math.max(0, r - start));
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  const segs = toSegments(slice, shifted);
  return [{ text: prefix, match: false }, ...segs, { text: suffix, match: false }];
}

/**
 * Filter + rank flows by a query over the precomputed content index
 * (which already contains scouting + node text). Blank query → all flows
 * in their incoming order, no snippets.
 */
export function filterFlows(
  summaries: RoundSummary[],
  index: Map<string, string>,
  query: string,
): FlowMatch[] {
  const q = query.trim();
  if (!q) return summaries.map((s) => ({ summary: s, snippet: null }));

  const ids = summaries.map((s) => s.id);
  const haystack = ids.map((id) => index.get(id) ?? "");
  const byId = new Map(summaries.map((s) => [s.id, s]));

  const { order, ranges } = fuzzySearch(haystack, q);
  const out: FlowMatch[] = [];
  for (let i = 0; i < order.length; i++) {
    const id = ids[order[i]];
    const summary = byId.get(id);
    if (!summary) continue;
    out.push({ summary, snippet: snippetFor(haystack[order[i]], ranges[i] ?? []) });
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/dashboard/filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/filter.ts src/lib/dashboard/filter.test.ts
git commit -m "feat(dashboard): fuzzy filter over content index with snippets"
```

---

### Task 11: query-param routing — `/flow` editor page + redirect guard

**Files:**
- Create: `src/app/flow/page.tsx`
- Modify: `src/components/AppRoot.tsx` (becomes the flow-editor boot component)
- Modify: `src/components/RoundHeader.tsx` (home/back-to-flows; remove inline New round)
- Test: `src/components/AppRoot.test.tsx` (adjust existing expectations)

- [ ] **Step 1: Repurpose `AppRoot` to boot the editor from `?id=`**

Replace `src/components/AppRoot.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { attachAutosave, loadRound } from "@/lib/persistence/autosave";
import Workspace from "./Workspace";

/**
 * AppRoot — boots the editor for the flow identified by ?id=.
 * Attaches autosave, loads the round, and selects an initial sheet.
 * Redirects to "/" when the id is missing, not found, or trashed.
 */
export default function AppRoot() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const round = useRoundStore((s) => s.round);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = attachAutosave(useRoundStore);

    if (!id) {
      router.replace("/");
      return () => {
        mounted = false;
        unsubscribe();
      };
    }

    loadRound(id)
      .then((r) => {
        if (!mounted) return;
        if (!r || r.deletedAt != null) {
          router.replace("/");
          return;
        }
        const flowSheets = [...r.sheets].filter((s) => s.kind !== "cx").sort((a, b) => a.order - b.order);
        const firstSheet = flowSheets[0] ?? [...r.sheets].sort((a, b) => a.order - b.order)[0];
        useRoundStore.setState({ round: r, activeSheetId: firstSheet?.id ?? null });
      })
      .catch(() => router.replace("/"))
      .finally(() => {
        if (mounted) setLoaded(true);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [id, router]);

  if (!loaded || !round) return null;
  return <Workspace />;
}
```

- [ ] **Step 2: Create the `/flow` route**

Create `src/app/flow/page.tsx`:

```tsx
import { Suspense } from "react";
import AppRoot from "@/components/AppRoot";

export default function FlowPage() {
  return (
    <Suspense fallback={null}>
      <AppRoot />
    </Suspense>
  );
}
```

> `useSearchParams` requires a Suspense boundary in Next 15 static export.

- [ ] **Step 3: Add the home affordance to `RoundHeader`; route New round / Import via the dashboard**

In `src/components/RoundHeader.tsx`:
- Import `Link` from `next/link`.
- Wrap the participants label (or add a left "← Flows" button) linking to `/`.
- Replace `handleNewRound` (which set `round: null`) with a link to `/` (the dashboard owns flow creation now).

Concretely, change the header's left side to:

```tsx
import Link from "next/link";
```
```tsx
      <div className="flex items-center gap-3">
        <Link href="/" className="text-[13px] text-zinc-500 hover:text-zinc-800" data-testid="back-to-flows">
          ← Flows
        </Link>
        <span className="text-sm font-semibold text-zinc-900">{participants}</span>
      </div>
```

And remove the `New round` button (the `handleNewRound` function and its `<Button data-testid="new-round-btn">`). Keep Info, Settings, Export, Import as-is.

- [ ] **Step 4: Update `AppRoot.test.tsx`**

The existing tests assume `AppRoot` auto-loads the last round and renders `RoundSetup` when empty. Update them to the new contract: with no `?id=`, it redirects (renders null); with a valid `?id=`, it renders the workspace. Mock `next/navigation`:

```tsx
import { vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

let mockSearch = "";
```

Write two tests:
- `mockSearch = ""` → after render, `replace` called with `"/"`.
- `mockSearch = "id=<seeded id>"` (seed via `persistRound`) → `screen.findByTestId("workspace")` resolves.

(Use `fake-indexeddb/auto` at top, seed with `persistRound` from `autosave`.)

- [ ] **Step 5: Run tests to verify**

Run: `npx vitest run src/components/AppRoot.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/flow/page.tsx src/components/AppRoot.tsx src/components/RoundHeader.tsx src/components/AppRoot.test.tsx
git commit -m "feat(routing): /flow?id= editor page + redirect guard + home affordance"
```

---

### Task 12: Dashboard shell — top bar, controls, grid (no kebab/import yet)

**Files:**
- Create: `src/components/dashboard/Dashboard.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/dashboard/Dashboard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/Dashboard.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import Dashboard from "./Dashboard";
import { persistRound, softDeleteRound } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string, over: Partial<Round> = {}): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: { ...emptyScouting(), affSchool: id === "a" ? "Westwood" : "Mission", tournament: "Berkeley" },
    sheets: [], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
    ...over,
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
  push.mockReset();
});

describe("Dashboard", () => {
  it("lists live flows and excludes trashed", async () => {
    await persistRound(mk("a", { updatedAt: 5 }));
    await persistRound(mk("b", { updatedAt: 2, deletedAt: 1 }));
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("Westwood")).toBeInTheDocument());
    expect(screen.queryByText("Mission")).not.toBeInTheDocument();
  });

  it("navigates to the editor on card click", async () => {
    await persistRound(mk("a"));
    render(<Dashboard />);
    await waitFor(() => screen.getByTestId("flow-card-a"));
    await userEvent.click(screen.getByTestId("flow-card-a"));
    expect(push).toHaveBeenCalledWith("/flow?id=a");
  });

  it("shows the empty state when there are no flows", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Dashboard.tsx`**

Create `src/components/dashboard/Dashboard.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { listRounds, type RoundSummary } from "@/lib/persistence/autosave";
import { loadSearchIndex, backfillSearchIndex } from "@/lib/persistence/searchIndex";
import { filterFlows } from "@/lib/dashboard/filter";
import { sortSummaries, groupByTournament, type SortKey } from "@/lib/dashboard/organize";
import FlowCard from "./FlowCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<RoundSummary[] | null>(null);
  const [index, setIndex] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [grouped, setGrouped] = useState(false);

  const refresh = useCallback(async () => {
    await backfillSearchIndex();
    const [list, idx] = await Promise.all([listRounds(), loadSearchIndex()]);
    setSummaries(list);
    setIndex(idx);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback((id: string) => router.push(`/flow?id=${id}`), [router]);

  const matches = useMemo(
    () => filterFlows(summaries ?? [], index, query),
    [summaries, index, query],
  );
  const sorted = useMemo(() => {
    // Preserve fuzzy rank when searching; otherwise apply the chosen sort.
    if (query.trim()) return matches;
    const order = sortSummaries(matches.map((m) => m.summary), sort);
    const byId = new Map(matches.map((m) => [m.summary.id, m]));
    return order.map((s) => byId.get(s.id)!);
  }, [matches, sort, query]);

  const groups = useMemo(
    () => (grouped ? groupByTournament(sorted.map((m) => m.summary)) : null),
    [grouped, sorted],
  );

  function openNewFlow() {
    // Quick-create with default role is handled by NewFlowButton in a later task;
    // placeholder here keeps the shell self-contained until Task 14 wires it.
  }

  if (summaries === null) return null;

  const empty = summaries.length === 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
        <span className="text-[15px] font-bold tracking-tight">
          Debate<span className="text-blue-600">Flow</span>
        </span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search flows…"
          className="h-9 max-w-[360px]"
          data-testid="dashboard-search"
        />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Settings"
          data-testid="dashboard-settings"
          onClick={() => useRoundStore.getState().setSettingsOpen(true)}
        >
          <span className="text-base leading-none">⚙</span>
        </Button>
        <Button size="sm" data-testid="new-flow" onClick={openNewFlow}>
          + New flow
        </Button>
      </div>

      <div className="px-5 py-5">
        {empty ? (
          <div
            data-testid="dashboard-empty"
            className="mx-auto mt-20 flex max-w-sm flex-col items-center gap-4 text-center"
          >
            <p className="text-[15px] font-medium text-zinc-700">No flows yet</p>
            <p className="text-[13px] text-zinc-500">Create your first flow to get started.</p>
            <Button size="sm" onClick={openNewFlow}>+ New flow</Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4 text-[12.5px] text-zinc-500">
              <span data-testid="flow-count">{summaries.length} flows</span>
              <div className="flex-1" />
              <label className="flex items-center gap-2">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  data-testid="sort-select"
                  className="rounded border border-border bg-card px-2 py-1"
                >
                  <option value="updated">Last edited</option>
                  <option value="date">Date</option>
                  <option value="tournament">Tournament</option>
                  <option value="result">Result</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={grouped}
                  onChange={(e) => setGrouped(e.target.checked)}
                  data-testid="group-toggle"
                />
                Group by tournament
              </label>
            </div>

            {groups ? (
              groups.map((g) => (
                <section key={g.label} className="mb-6">
                  <h2 className="mb-2 text-[11px] font-bold tracking-widest text-zinc-400 uppercase">
                    {g.label}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((s) => (
                      <FlowCard key={s.id} summary={s} onOpen={open} />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((m) => (
                  <FlowCard key={m.summary.id} summary={m.summary} onOpen={open} snippet={m.snippet} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Point `/` at the dashboard**

Replace `src/app/page.tsx` with:

```tsx
import Dashboard from "@/components/dashboard/Dashboard";

export default function Home() {
  return <Dashboard />;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx src/app/page.tsx src/components/dashboard/Dashboard.test.tsx
git commit -m "feat(dashboard): shell with search, sort, group, grid, empty state"
```

---

### Task 13: Settings + SearchPalette unavailable off-editor — mount Settings on the dashboard

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`
- Test: `src/components/dashboard/Dashboard.test.tsx`

The dashboard's ⚙ sets `settingsOpen`, but `SettingsPanel` is only mounted inside `Workspace`. Mount it on the dashboard too.

- [ ] **Step 1: Write the failing test**

Append to `Dashboard.test.tsx`:

```ts
it("opens settings from the gear", async () => {
  await persistRound(mk("a"));
  render(<Dashboard />);
  await waitFor(() => screen.getByTestId("dashboard-settings"));
  await userEvent.click(screen.getByTestId("dashboard-settings"));
  expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL — settings panel not in the tree.

- [ ] **Step 3: Mount `SettingsPanel`**

In `Dashboard.tsx`, import and render it once at the end of the root div:

```tsx
import SettingsPanel from "@/components/SettingsPanel";
```
```tsx
      <SettingsPanel />
    </div>
```

> `SettingsPanel` reads `settingsOpen` from the store and is round-independent for the Display + Keyboard panes (it only touches keymap/display settings, not `round`). Confirm it renders with `round === null`; if it dereferences `round`, guard those reads.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx src/components/dashboard/Dashboard.test.tsx
git commit -m "feat(dashboard): open Settings from the dashboard gear"
```

---

### Task 14: New-flow role picker + kebab menu (export, view details, delete + undo)

**Files:**
- Create: `src/components/dashboard/NewFlowButton.tsx`
- Create: `src/components/dashboard/FlowCardMenu.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`
- Test: `src/components/dashboard/NewFlowButton.test.tsx`
- Test: `src/components/dashboard/FlowCardMenu.test.tsx`

- [ ] **Step 1: Write the failing NewFlowButton test**

Create `src/components/dashboard/NewFlowButton.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import NewFlowButton from "./NewFlowButton";
import { useRoundStore } from "@/lib/store/useRoundStore";

beforeEach(() => {
  push.mockReset();
  useRoundStore.setState({ round: null });
});

describe("NewFlowButton", () => {
  it("creates a flow with the chosen role and navigates to it", async () => {
    render(<NewFlowButton />);
    await userEvent.click(screen.getByTestId("new-flow"));
    await userEvent.click(screen.getByTestId("new-flow-role-neg"));
    expect(push).toHaveBeenCalledTimes(1);
    const arg = push.mock.calls[0][0] as string;
    expect(arg).toMatch(/^\/flow\?id=round_/);
    expect(useRoundStore.getState().round?.role).toBe("neg");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/NewFlowButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `NewFlowButton.tsx`**

Create `src/components/dashboard/NewFlowButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import { persistRound } from "@/lib/persistence/autosave";
import type { Role } from "@/lib/model/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLES: { role: Role; label: string }[] = [
  { role: "aff", label: "Aff" },
  { role: "neg", label: "Neg" },
  { role: "judge", label: "Judge" },
];

export default function NewFlowButton() {
  const router = useRouter();

  function create(role: Role) {
    const store = useRoundStore.getState();
    store.createRound({ role, format: makeFormatByKey("policy") });
    store.addSheet({ title: role === "neg" ? "Neg" : "Aff", group: role === "judge" ? "aff" : role });
    const round = useRoundStore.getState().round;
    if (!round) return;
    void persistRound(round);
    router.push(`/flow?id=${round.id}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" data-testid="new-flow">+ New flow</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ROLES.map(({ role, label }) => (
          <DropdownMenuItem
            key={role}
            data-testid={`new-flow-role-${role}`}
            onSelect={() => create(role)}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/NewFlowButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing FlowCardMenu test**

Create `src/components/dashboard/FlowCardMenu.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

import FlowCardMenu from "./FlowCardMenu";
import { persistRound, listTrash, listRounds } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: emptyScouting(), sheets: [], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("FlowCardMenu", () => {
  it("soft-deletes the flow and calls onChanged", async () => {
    await persistRound(mk("a"));
    const onChanged = vi.fn();
    render(<FlowCardMenu id="a" onViewDetails={() => {}} onChanged={onChanged} />);
    await userEvent.click(screen.getByTestId("kebab-a"));
    await userEvent.click(await screen.findByTestId("kebab-delete-a"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await listRounds()).length).toBe(0);
    expect((await listTrash()).map((s) => s.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/FlowCardMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `FlowCardMenu.tsx`**

Create `src/components/dashboard/FlowCardMenu.tsx`:

```tsx
"use client";

import { toast } from "sonner";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { loadRound, softDeleteRound, restoreRound } from "@/lib/persistence/autosave";
import { runExport } from "@/lib/export/run";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface FlowCardMenuProps {
  id: string;
  onViewDetails: (id: string) => void;
  onChanged: () => void;
}

export default function FlowCardMenu({ id, onViewDetails, onChanged }: FlowCardMenuProps) {
  const autoNumber = useRoundStore((s) => s.autoNumber);

  async function exportAs(fmt: "json" | "excel") {
    const round = await loadRound(id);
    if (!round) return;
    try {
      await runExport(round, { autoNumber }, fmt);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  async function del() {
    await softDeleteRound(id);
    onChanged();
    toast("Flow moved to trash", {
      action: {
        label: "Undo",
        onClick: async () => {
          await restoreRound(id);
          onChanged();
        },
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`kebab-${id}`}
          aria-label="Flow actions"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3.5 right-3.5 hidden h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 group-hover:flex hover:bg-zinc-200"
        >
          ⋯
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem data-testid={`kebab-details-${id}`} onSelect={() => onViewDetails(id)}>
          View details
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => void exportAs("json")}>JSON</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportAs("excel")}>Excel</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          data-testid={`kebab-delete-${id}`}
          onSelect={() => void del()}
          className="text-red-600"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

> If `dropdown-menu.tsx` doesn't export the `Sub*` parts, add them (mirror Radix `DropdownMenu.Sub`, `.SubTrigger`, `.SubContent`) following the existing file's wrapper style. Verify exports first with `grep "export" src/components/ui/dropdown-menu.tsx`.

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/FlowCardMenu.test.tsx`
Expected: PASS

- [ ] **Step 9: Wire NewFlowButton + kebab into the Dashboard**

In `Dashboard.tsx`:
- Replace the two `+ New flow` buttons (`openNewFlow`) with `<NewFlowButton />`.
- Pass a `menu` prop to each `FlowCard`: `menu={<FlowCardMenu id={s.id} onViewDetails={setDetailId} onChanged={refresh} />}` (add `const [detailId, setDetailId] = useState<string | null>(null);`).
- `FlowCard` already renders `{menu}`.

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx` → PASS

- [ ] **Step 10: Commit**

```bash
git add src/components/dashboard/NewFlowButton.tsx src/components/dashboard/NewFlowButton.test.tsx src/components/dashboard/FlowCardMenu.tsx src/components/dashboard/FlowCardMenu.test.tsx src/components/dashboard/Dashboard.tsx src/components/ui/dropdown-menu.tsx
git commit -m "feat(dashboard): new-flow role picker + card kebab (export/details/delete+undo)"
```

---

### Task 15: Detail drawer

**Files:**
- Create: `src/components/dashboard/FlowDetailDrawer.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`
- Test: `src/components/dashboard/FlowDetailDrawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/FlowDetailDrawer.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import FlowDetailDrawer from "./FlowDetailDrawer";
import { persistRound } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: { ...emptyScouting(), affSchool: "Westwood", tournament: "Berkeley", judge: "K. Strange", decision: { vote: "aff", rfd: "clear" } },
    sheets: [{ id: "s", title: "Aff", group: "aff", order: 0, kind: "flow" }],
    nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("FlowDetailDrawer", () => {
  it("renders full scouting for the open id", async () => {
    await persistRound(mk("a"));
    render(<FlowDetailDrawer id="a" onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("Berkeley")).toBeInTheDocument());
    expect(screen.getByText("K. Strange")).toBeInTheDocument();
    expect(screen.getByText(/clear/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/FlowDetailDrawer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FlowDetailDrawer.tsx`**

Create `src/components/dashboard/FlowDetailDrawer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { loadRound } from "@/lib/persistence/autosave";
import { teamCode } from "@/lib/model/teamCode";
import type { Round } from "@/lib/model/types";

export interface FlowDetailDrawerProps {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}

function fullName(d: { first: string; last: string }): string {
  return `${d.first} ${d.last}`.trim() || "—";
}

export default function FlowDetailDrawer({ id, onClose }: FlowDetailDrawerProps) {
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);

  useEffect(() => {
    let on = true;
    if (id) loadRound(id).then((r) => on && setRound(r ?? null));
    else setRound(null);
    return () => {
      on = false;
    };
  }, [id]);

  const open = id !== null;
  const sc = round?.scouting;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {round && sc ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-border p-5">
              <SheetTitle className="text-[15px] font-semibold">
                <span className="text-blue-600">
                  {teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second) || "Untitled Aff"}
                </span>
                <span className="px-1.5 text-zinc-400">vs</span>
                <span className="text-red-600">
                  {teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second) || "Untitled Neg"}
                </span>
              </SheetTitle>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 text-[13px]">
              <Row label="Aff school" value={sc.affSchool || "—"} />
              <Row label="1A" value={fullName(sc.aff.first)} />
              <Row label="2A" value={fullName(sc.aff.second)} />
              <Row label="Neg school" value={sc.negSchool || "—"} />
              <Row label="1N" value={fullName(sc.neg.first)} />
              <Row label="2N" value={fullName(sc.neg.second)} />
              <Row label="Tournament" value={sc.tournament || "—"} />
              <Row label="Round" value={sc.round || "—"} />
              <Row label="Date" value={sc.date || "—"} />
              <Row label="Judge" value={sc.judge || "—"} />
              <Row label="Decision" value={sc.decision?.vote ? sc.decision.vote.toUpperCase() : "undecided"} />
              {sc.decision?.rfd && <Row label="RFD" value={sc.decision.rfd} />}
              <Row label="Role" value={round.role} />
              <Row label="Sheets" value={String(round.sheets.filter((s) => s.kind !== "cx").length)} />
            </div>

            <div className="flex gap-2 border-t border-border p-4">
              <Button size="sm" onClick={() => router.push(`/flow?id=${round.id}`)}>
                Open in editor
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-5 text-[13px] text-zinc-400">Loading…</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <span className="text-zinc-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/FlowDetailDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into Dashboard**

In `Dashboard.tsx`, render at the end: `<FlowDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={refresh} />`.

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/FlowDetailDrawer.tsx src/components/dashboard/FlowDetailDrawer.test.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat(dashboard): read-only detail drawer"
```

---

### Task 16: Import (single + backup) + Export all

**Files:**
- Create: `src/components/dashboard/ImportExportControls.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`
- Test: `src/components/dashboard/ImportExportControls.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/ImportExportControls.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import ImportExportControls from "./ImportExportControls";
import { listRounds } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: emptyScouting(), sheets: [{ id: "s", title: "Aff", group: "aff", order: 0, kind: "flow" }], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("ImportExportControls", () => {
  it("imports a single-flow file as a new flow", async () => {
    const onChanged = vi.fn();
    render(<ImportExportControls onChanged={onChanged} />);
    const file = new File(
      [JSON.stringify({ version: 2, round: mk("orig") })],
      "flow.json",
      { type: "application/json" },
    );
    await userEvent.upload(screen.getByTestId("import-input"), file);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const live = await listRounds();
    expect(live.length).toBe(1);
    expect(live[0].id).not.toBe("orig");
  });

  it("imports a backup file with multiple flows", async () => {
    const onChanged = vi.fn();
    render(<ImportExportControls onChanged={onChanged} />);
    const file = new File(
      [JSON.stringify({ version: 2, kind: "backup", rounds: [mk("a"), mk("b")] })],
      "backup.json",
      { type: "application/json" },
    );
    await userEvent.upload(screen.getByTestId("import-input"), file);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await listRounds()).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/dashboard/ImportExportControls.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ImportExportControls.tsx`**

Create `src/components/dashboard/ImportExportControls.tsx`:

```tsx
"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { db } from "@/lib/persistence/db";
import { persistRound, listRounds } from "@/lib/persistence/autosave";
import { parseImportFile, exportBackupJSON } from "@/lib/persistence/backup";
import { downloadBlob } from "@/lib/export/download";
import { Button } from "@/components/ui/button";

export interface ImportExportControlsProps {
  onChanged: () => void;
}

export default function ImportExportControls({ onChanged }: ImportExportControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const rounds = parseImportFile(text);
      for (const r of rounds) await persistRound(r);
      onChanged();
      toast.success(`Imported ${rounds.length} flow${rounds.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : "invalid file"}`);
    }
  }

  async function exportAll() {
    const live = await db.rounds.toArray();
    const rounds = live.filter((r) => r.deletedAt == null);
    if (rounds.length === 0) {
      toast("No flows to export");
      return;
    }
    const blob = new Blob([exportBackupJSON(rounds)], { type: "application/json" });
    downloadBlob(blob, `debate-flow-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        data-testid="import-input"
        onChange={onFile}
      />
      <Button variant="outline" size="sm" data-testid="import-btn" onClick={() => inputRef.current?.click()}>
        Import
      </Button>
      <Button variant="ghost" size="sm" data-testid="export-all-btn" onClick={() => void exportAll()}>
        Export all
      </Button>
    </>
  );
}
```

> `listRounds` import is unused here — remove it; kept the list filter inline via `db.rounds`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/dashboard/ImportExportControls.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into Dashboard top bar**

In `Dashboard.tsx`, replace the standalone Settings/New-flow cluster's neighborhood to include `<ImportExportControls onChanged={refresh} />` before the Settings gear.

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/ImportExportControls.tsx src/components/dashboard/ImportExportControls.test.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat(dashboard): single + backup import and export-all"
```

---

## PHASE 3 — Trash route + cleanup

### Task 17: Trash route + view

**Files:**
- Create: `src/components/TrashView.tsx`
- Create: `src/app/trash/page.tsx`
- Test: `src/components/TrashView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/TrashView.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

import TrashView from "./TrashView";
import { persistRound, softDeleteRound, listRounds, listTrash } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

function mk(id: string): Round {
  return {
    id, createdAt: 1, updatedAt: 1, role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 240, neg: 240 } },
    scouting: { ...emptyScouting(), affSchool: id }, sheets: [], nodes: [], groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
  };
}

beforeEach(async () => {
  await db.rounds.clear();
  await db.searchIndex.clear();
});

describe("TrashView", () => {
  it("restores a trashed flow", async () => {
    await persistRound(mk("a"));
    await softDeleteRound("a");
    render(<TrashView />);
    await waitFor(() => screen.getByTestId("trash-restore-a"));
    await userEvent.click(screen.getByTestId("trash-restore-a"));
    await waitFor(async () => expect((await listRounds()).map((s) => s.id)).toEqual(["a"]));
  });

  it("permanently deletes a flow", async () => {
    await persistRound(mk("a"));
    await softDeleteRound("a");
    render(<TrashView />);
    await waitFor(() => screen.getByTestId("trash-delete-a"));
    await userEvent.click(screen.getByTestId("trash-delete-a"));
    await waitFor(async () => expect(await db.rounds.get("a")).toBeUndefined());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/TrashView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TrashView.tsx`**

Create `src/components/TrashView.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listTrash, restoreRound, deleteRoundForever, type RoundSummary } from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { deleteSearchIndex } from "@/lib/persistence/searchIndex";
import FlowCard from "./dashboard/FlowCard";
import { Button } from "./ui/button";

export default function TrashView() {
  const [items, setItems] = useState<RoundSummary[] | null>(null);

  const refresh = useCallback(async () => {
    setItems(await listTrash());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function restore(id: string) {
    await restoreRound(id);
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm("Permanently delete this flow? This cannot be undone.")) return;
    await deleteRoundForever(id);
    await refresh();
  }

  async function emptyTrash() {
    if (!confirm("Permanently delete ALL flows in trash?")) return;
    const trashed = (await db.rounds.toArray()).filter((r) => r.deletedAt != null);
    for (const r of trashed) {
      await db.rounds.delete(r.id);
      await deleteSearchIndex(r.id);
    }
    await refresh();
  }

  if (items === null) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
        <Link href="/" className="text-[13px] text-zinc-500 hover:text-zinc-800" data-testid="trash-back">
          ← Flows
        </Link>
        <span className="text-[15px] font-semibold">Trash</span>
        <div className="flex-1" />
        {items.length > 0 && (
          <Button variant="ghost" size="sm" data-testid="empty-trash" onClick={() => void emptyTrash()}>
            Empty trash
          </Button>
        )}
      </div>

      <div className="px-5 py-5">
        {items.length === 0 ? (
          <p className="mt-20 text-center text-[13px] text-zinc-400">Trash is empty.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <div key={s.id} className="flex flex-col gap-2">
                <FlowCard summary={s} onOpen={() => {}} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" data-testid={`trash-restore-${s.id}`} onClick={() => void restore(s.id)}>
                    Restore
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600" data-testid={`trash-delete-${s.id}`} onClick={() => void remove(s.id)}>
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

> Tests run under jsdom where `confirm` returns `undefined` (falsy), which would block deletion. In `TrashView.test.tsx`, stub it: add `beforeEach(() => { vi.stubGlobal("confirm", () => true); })` and `import { vi } from "vitest"`.

- [ ] **Step 4: Create the route**

Create `src/app/trash/page.tsx`:

```tsx
import TrashView from "@/components/TrashView";

export default function TrashPage() {
  return <TrashView />;
}
```

- [ ] **Step 5: Add a Trash link from the dashboard**

In `Dashboard.tsx` top bar, add near Settings: `<Link href="/trash" className="text-[13px] text-zinc-500 hover:text-zinc-800" data-testid="dashboard-trash-link">Trash</Link>` (import `Link` from `next/link`).

- [ ] **Step 6: Run tests to verify**

Run: `npx vitest run src/components/TrashView.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/TrashView.tsx src/app/trash/page.tsx src/components/TrashView.test.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat(trash): /trash route with restore, delete-forever, empty"
```

---

### Task 18: Retire `RoundSetup` + clean up dead references

**Files:**
- Delete: `src/components/RoundSetup.tsx`
- Delete: `src/components/RoundSetup.test.tsx`
- Modify: any remaining importers (grep first)

- [ ] **Step 1: Find references**

Run: `git grep -n "RoundSetup"`
Expected: only the two files above (AppRoot no longer imports it after Task 11). If any other importer exists, repoint it (the dashboard empty state + `NewFlowButton` cover its role).

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/RoundSetup.tsx src/components/RoundSetup.test.tsx
```

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: PASS (no dangling imports).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: retire RoundSetup (replaced by dashboard empty state + new-flow)"
```

---

### Task 19: Full verification + build

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors (fix any unused imports flagged, e.g. the `listRounds` import noted in Task 16).

- [ ] **Step 2: Type-check via build**

Run: `npm run build`
Expected: static export succeeds; `/`, `/flow`, `/trash` pages emitted under `out/`.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 4: Manual smoke (optional, via the `run` skill)**

Verify in the browser: dashboard lists flows; search narrows + shows content snippets; sort + group toggle; new-flow role picker → editor; back to flows; kebab export (JSON/Excel) downloads; delete shows Undo toast and the flow appears in `/trash`; restore + delete-forever + empty trash; import a single file and a backup; export all.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint/build fixes for flows dashboard"
```

---

## Self-review notes (coverage map)

- Routing (spec §1) → Tasks 11, 12, 17.
- Soft delete + `deletedAt` (§2.1) → Tasks 1, 2, 5.
- Extended summary (§2.2) → Tasks 3, 5.
- Search index (§2.3) → Tasks 2, 4, 5.
- Import fresh-id + backup (§2.4) → Task 6; UI in Task 16.
- Export per-flow JSON/Excel + export-all (§2.5) → Tasks 7, 14, 16.
- Dashboard layout/cards/empty state/new-flow (§3) → Tasks 8, 12, 13, 14.
- Search + snippet (§4) → Tasks 10, 12.
- Detail drawer (§5.1) → Task 15.
- Trash route (§5.2) → Task 17.
- Undo toast (§5.3) → Tasks 7, 14.
- Retire RoundSetup → Task 18.
