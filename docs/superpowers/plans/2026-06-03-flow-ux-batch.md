# Flow UX Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six related UX/feature improvements to the debate flow app — a nav settings button,
flow-sheet aesthetics, display-preference toggles, full undo/redo with cell+sheet deletion, an
editable scouting/Info panel, and a dedicated CX sheet.

**Architecture:** Built on the live model (`Round` + `ArgumentNode[]` + `Sheet[]`) in
`useRoundStore`, where `round` is replaced immutably on every mutation. Undo is therefore
snapshot-based: a `commit()` wrapper pushes the prior `round` onto a `past` stack before each
_content_ mutation. New round fields (`scouting`, `cx`, `Sheet.kind`) flow through Dexie autosave
and JSON import automatically, with normalization for legacy data. Spec:
`docs/superpowers/specs/2026-06-03-flow-ux-batch-design.md`.

**Tech Stack:** Next.js, React, TypeScript, Zustand, Vitest + Testing Library, Tailwind, fflate
(xlsx zip surgery).

**Test command:** `npx vitest run <path>` for one file; `npx vitest run` for all. Lint:
`npm run lint`. Types: `npx tsc --noEmit`.

---

## Phase 0 — Foundation (model + undo). Do first; later phases build on it.

### Task 1: Model additions — scouting, cx, Sheet.kind; remove topic

**Files:**

- Modify: `src/lib/model/types.ts`

- [ ] **Step 1: Add the new types and fields**

In `src/lib/model/types.ts`, add a `kind` field to `Sheet`:

```ts
/** A flow sheet (page) grouping arguments. */
export interface Sheet {
  id: string;
  title: string;
  group: "aff" | "neg";
  /** Display order among sheets. */
  order: number;
  /** Sheet variety. Absent / 'flow' = the normal argument grid. 'cx' = the cross-ex sheet. */
  kind?: "flow" | "cx";
}
```

Add scouting + CX types (anywhere after `RoundMeta`):

```ts
/** One debater's name. */
export interface Debater {
  first: string;
  last: string;
}

/** Round result as recorded for scouting. */
export interface Decision {
  vote?: "aff" | "neg";
  rfd?: string;
}

/** Scouting / Info-sheet data, mirroring the Excel Info sheet. */
export interface Scouting {
  affSchool?: string;
  negSchool?: string;
  /** Aff debaters: first = 1A, second = 2A. */
  aff: { first: Debater; second: Debater };
  /** Neg debaters: first = 1N, second = 2N. */
  neg: { first: Debater; second: Debater };
  tournament?: string;
  round?: string;
  date?: string;
  judge?: string;
  decision?: Decision;
}

/** A single cross-examination question/response pair. */
export interface CxRow {
  id: string;
  question: string;
  response: string;
}

/** Cross-ex data keyed by CX period. */
export interface CxData {
  "1AC": CxRow[];
  "1NC": CxRow[];
  "2AC": CxRow[];
  "2NC": CxRow[];
}

/** The fixed CX period keys, in display order. */
export type CxPeriod = keyof CxData;
```

In the `Round` interface: **remove** the `topic?: string;` line and add the two new fields:

```ts
export interface Round {
  id: string;
  createdAt: number;
  updatedAt: number;
  role: Role;
  format: Format;
  meta: RoundMeta;
  scouting: Scouting;
  sheets: Sheet[];
  nodes: ArgumentNode[];
  cx: CxData;
  timers: TimerState;
}
```

- [ ] **Step 2: Verify it compiles (will surface call sites to fix in later tasks)**

Run: `npx tsc --noEmit` Expected: errors only in places that read `round.topic` or construct a
`Round` without `scouting`/`cx` (`useRoundStore.ts`, `RoundSetup.tsx`, export/io code). These are
fixed in Tasks 5, 14, 16. Do **not** fix them here.

- [ ] **Step 3: Commit**

```bash
git add src/lib/model/types.ts
git commit -m "feat(model): add Scouting, CxData, Sheet.kind; remove topic"
```

---

### Task 2: `teamCode` pure helper

**Files:**

- Create: `src/lib/model/teamCode.ts`
- Test: `src/lib/model/teamCode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { teamCode } from "./teamCode";
import type { Debater } from "./types";

const d = (first: string, last: string): Debater => ({ first, last });

describe("teamCode", () => {
  it("returns empty string when school is blank", () => {
    expect(teamCode("", d("Al", "Smith"), d("Bo", "Jones"))).toBe("");
  });

  it("orders two debaters by last-name initial alphabetically", () => {
    // Jones (J) before Smith (S)
    expect(teamCode("Westwood", d("Al", "Smith"), d("Bo", "Jones"))).toBe("Westwood JS");
  });

  it("keeps order when already alphabetical", () => {
    expect(teamCode("Westwood", d("Al", "Adams"), d("Bo", "Baker"))).toBe("Westwood AB");
  });

  it("falls back to first+last initial of the single debater present", () => {
    expect(teamCode("Westwood", d("Carol", "Diaz"), d("", ""))).toBe("Westwood CD");
  });

  it("uses the second debater alone if first is empty", () => {
    expect(teamCode("Westwood", d("", ""), d("Carol", "Diaz"))).toBe("Westwood CD");
  });

  it("returns just the school when no debater names are present", () => {
    expect(teamCode("Westwood", d("", ""), d("", ""))).toBe("Westwood");
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `npx vitest run src/lib/model/teamCode.test.ts` Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { Debater } from "./types";

const initial = (s: string): string => (s.trim()[0] ?? "").toUpperCase();
const hasLast = (d: Debater): boolean => d.last.trim().length > 0;

/**
 * Team code mirroring the Excel Info-sheet formula:
 *   school + " " + initials
 * Two debaters with last names → both last-name initials, alphabetized.
 * One debater → that debater's first + last initial.
 * No names → just the school. Blank school → "".
 */
export function teamCode(school: string, first: Debater, second: Debater): string {
  const s = school.trim();
  if (!s) return "";

  const present = [first, second].filter(hasLast);
  if (present.length === 2) {
    const inits = present.map((d) => initial(d.last)).sort((a, b) => a.localeCompare(b));
    return `${s} ${inits[0]}${inits[1]}`;
  }
  // Single debater (or fall back to whichever has any name).
  const solo = present[0] ?? [first, second].find((d) => d.first.trim() || d.last.trim());
  if (solo) {
    const code = `${initial(solo.first)}${initial(solo.last)}`;
    return code ? `${s} ${code}` : s;
  }
  return s;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run src/lib/model/teamCode.test.ts` Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/model/teamCode.ts src/lib/model/teamCode.test.ts
git commit -m "feat(model): add teamCode helper mirroring the Excel formula"
```

---

### Task 3: Undo/redo engine in the store

**Files:**

- Modify: `src/lib/store/useRoundStore.ts`
- Test: `src/lib/store/useRoundStore.test.ts`

This task adds the engine and routes the existing content mutations through it. It does NOT yet add
scouting/cx actions (Tasks 5, 12, 17).

- [ ] **Step 1: Write failing tests**

Append to `src/lib/store/useRoundStore.test.ts` (follow the file's existing setup for creating a
round; if it has a helper, reuse it — otherwise call `createRound` + `addSheet` as the other tests
do):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useRoundStore } from "./useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";

function freshRound() {
  useRoundStore
    .getState()
    .createRound({ role: "aff", format: makeFormatByKey("policy"), meta: {} });
}

describe("undo/redo", () => {
  beforeEach(() => {
    useRoundStore.setState({ round: null, past: [], future: [], selection: null, mode: "normal" });
    freshRound();
  });

  it("undoes a node addition", () => {
    const s = useRoundStore.getState();
    const sheetId = s.addSheet({ title: "Aff", group: "aff" });
    const speechId = useRoundStore.getState().round!.format.speeches[0].id;
    useRoundStore.getState().addNode({ sheetId, speechId, parentId: null, text: "x" });
    expect(useRoundStore.getState().round!.nodes.length).toBe(1);

    useRoundStore.getState().undo();
    expect(useRoundStore.getState().round!.nodes.length).toBe(0);

    useRoundStore.getState().redo();
    expect(useRoundStore.getState().round!.nodes.length).toBe(1);
  });

  it("undoes a sheet deletion, restoring its nodes", () => {
    const s = useRoundStore.getState();
    const sheetId = s.addSheet({ title: "Aff", group: "aff" });
    const speechId = useRoundStore.getState().round!.format.speeches[0].id;
    useRoundStore.getState().addNode({ sheetId, speechId, parentId: null, text: "x" });

    useRoundStore.getState().removeSheet(sheetId);
    expect(useRoundStore.getState().round!.sheets.find((x) => x.id === sheetId)).toBeUndefined();

    useRoundStore.getState().undo();
    expect(useRoundStore.getState().round!.sheets.find((x) => x.id === sheetId)).toBeDefined();
    expect(useRoundStore.getState().round!.nodes.length).toBe(1);
  });

  it("coalesces consecutive text edits to the same node into one undo step", () => {
    const s = useRoundStore.getState();
    const sheetId = s.addSheet({ title: "Aff", group: "aff" });
    const speechId = useRoundStore.getState().round!.format.speeches[0].id;
    const nodeId = useRoundStore
      .getState()
      .addNode({ sheetId, speechId, parentId: null, text: "" });

    useRoundStore.getState().updateNodeText(nodeId, "a");
    useRoundStore.getState().updateNodeText(nodeId, "ab");
    useRoundStore.getState().updateNodeText(nodeId, "abc");

    // One undo reverts ALL the coalesced text edits back to the post-add value ('').
    useRoundStore.getState().undo();
    expect(useRoundStore.getState().round!.nodes.find((n) => n.id === nodeId)!.text).toBe("");
  });

  it("does not create undo entries for timer ticks", () => {
    const s = useRoundStore.getState();
    const speechId = useRoundStore.getState().round!.format.speeches[0].id;
    s.startSpeech(speechId);
    const depthBefore = useRoundStore.getState().past.length;
    useRoundStore.getState().tickSpeech();
    useRoundStore.getState().tickSpeech();
    expect(useRoundStore.getState().past.length).toBe(depthBefore);
  });

  it("does not create undo entries for selection changes", () => {
    const depthBefore = useRoundStore.getState().past.length;
    useRoundStore.getState().setSelection({ sheetId: "a", speechId: "b", nodeId: "" });
    expect(useRoundStore.getState().past.length).toBe(depthBefore);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/store/useRoundStore.test.ts` Expected: FAIL —
`past`/`future`/`undo`/`redo` undefined.

- [ ] **Step 3: Add state + actions to the store**

In `RoundState` add:

```ts
  past: Round[];
  future: Round[];
  /** Internal: identifies the last commit so consecutive same-key commits coalesce. */
  lastCommitKey: string | null;
```

In `RoundActions` add:

```ts
  undo(): void;
  redo(): void;
```

In the initial state add `past: [], future: [], lastCommitKey: null,`.

Add a module-level constant and a private commit helper near the top of the store body (after
`const initialKeymapSettings = ...`):

```ts
const UNDO_DEPTH = 50;
```

Inside `create<RoundStore>((set, get) => ({ ... }))`, add a non-exported helper by defining it as a
closure used by the actions. Implement `commit` as a local function via `get`/`set`:

```ts
  // ── undo/redo plumbing ───────────────────────────────────────────────────────
  // commit(coalesceKey, producer): snapshot current round, then replace it.
  // When coalesceKey matches the previous commit's key, the snapshot is reused
  // (the prior edits collapse into one undo step).
  _commit(coalesceKey: string | null, producer: (round: Round) => Round) {
    const { round, past, lastCommitKey } = get();
    if (!round) return;
    const next = producer(round);
    const coalesce = coalesceKey !== null && coalesceKey === lastCommitKey;
    const newPast = coalesce ? past : [...past, round].slice(-UNDO_DEPTH);
    set({ round: { ...next, updatedAt: Date.now() }, past: newPast, future: [], lastCommitKey: coalesceKey });
  },

  undo() {
    const { past, future, round } = get();
    if (past.length === 0 || !round) return;
    const previous = past[past.length - 1];
    set({
      round: previous,
      past: past.slice(0, -1),
      future: [round, ...future].slice(0, UNDO_DEPTH),
      lastCommitKey: null,
    });
    get()._reconcileAfterHistory();
  },

  redo() {
    const { past, future, round } = get();
    if (future.length === 0 || !round) return;
    const next = future[0];
    set({
      round: next,
      past: [...past, round].slice(-UNDO_DEPTH),
      future: future.slice(1),
      lastCommitKey: null,
    });
    get()._reconcileAfterHistory();
  },

  // After undo/redo, drop selection/activeSheet if they now point at something gone.
  _reconcileAfterHistory() {
    const { round, activeSheetId, selection } = get();
    if (!round) return;
    const sheetExists = (id: string | null) => !!id && round.sheets.some(s => s.id === id);
    const nextActive = sheetExists(activeSheetId) ? activeSheetId : (round.sheets[0]?.id ?? null);
    const selValid = selection
      && round.sheets.some(s => s.id === selection.sheetId)
      && (selection.nodeId === '' || round.nodes.some(n => n.id === selection.nodeId));
    set({ activeSheetId: nextActive, selection: selValid ? selection : null });
  },
```

Add `_commit`, `undo`, `redo`, `_reconcileAfterHistory` to the `RoundActions` interface (the
`_`-prefixed ones typed as `(...) => void`). (Zustand stores are flat objects, so internal helpers
live on the store; the `_` prefix marks them internal.)

- [ ] **Step 4: Route existing content mutations through `_commit`**

Rewrite these actions to call `_commit` instead of `set` directly. Replace each body:

`addSheet` — wrap the round mutation. Because it must still return the new sheet id, compute the
sheet first:

```ts
  addSheet({ title, group }) {
    const { round, activeSheetId } = get();
    if (!round) throw new Error('No active round');
    const maxOrder = round.sheets.length > 0 ? Math.max(...round.sheets.map(s => s.order)) : -1;
    const sheet: Sheet = { id: uid('sheet'), title, group, order: maxOrder + 1 };
    const isFirst = round.sheets.length === 0;
    get()._commit(null, r => ({ ...r, sheets: [...r.sheets, sheet] }));
    if (isFirst) set({ activeSheetId: sheet.id });
    else set({ activeSheetId });
    return sheet.id;
  },
```

`renameSheet`:
`get()._commit(null, r => ({ ...r, sheets: r.sheets.map(s => s.id === sheetId ? { ...s, title } : s) }));`

`removeSheet`: keep the activeSheet/selection reconciliation but route the round change through
commit:

```ts
  removeSheet(sheetId) {
    const { round, activeSheetId, selection } = get();
    if (!round) return;
    const remaining = round.sheets.filter(s => s.id !== sheetId);
    get()._commit(null, r => ({
      ...r,
      sheets: remaining,
      nodes: r.nodes.filter(n => n.sheetId !== sheetId),
    }));
    if (activeSheetId === sheetId) set({ activeSheetId: remaining[0]?.id ?? null });
    if (selection?.sheetId === sheetId) set({ selection: null });
  },
```

`reorderSheet`:
`get()._commit(null, r => ({ ...r, sheets: r.sheets.map(s => s.id === sheetId ? { ...s, order: newOrder } : s) }));`

`addNode`:

```ts
  addNode(input) {
    const { round } = get();
    if (!round) throw new Error('No active round');
    const { nodes, node } = treeAddNode(round.nodes, input);
    get()._commit(null, r => ({ ...r, nodes }));
    return node.id;
  },
```

`updateNodeText` — **coalesce by node id**:

```ts
  updateNodeText(nodeId, text) {
    if (!get().round) return;
    get()._commit(`text:${nodeId}`, r => ({ ...r, nodes: updateText(r.nodes, nodeId, text) }));
  },
```

`toggleNodeStatus`:
`get()._commit(null, r => ({ ...r, nodes: toggleStatus(r.nodes, nodeId, status) }));`

`setNodeParent`:
`get()._commit(null, r => ({ ...r, nodes: setParent(r.nodes, nodeId, parentId) }));`

`removeNode`:

```ts
  removeNode(nodeId) {
    const { round, selection } = get();
    if (!round) return;
    get()._commit(null, r => ({ ...r, nodes: treeRemoveNode(r.nodes, nodeId) }));
    if (selection?.nodeId === nodeId) set({ selection: null });
  },
```

`moveNode`: `get()._commit(null, r => ({ ...r, nodes: treeMoveNode(r.nodes, nodeId, newOrder) }));`

**Do NOT touch** `startSpeech`, `tickSpeech`, `startPrep`, `stopPrep`, `tickPrep`, `setMode`,
`setSelection`, or any UI-flag action — these must not go through `_commit`. (Note:
`entering insert mode` should end a text coalescing group. In `setMode`, when switching to a
different mode, clear the key: add `set({ mode, lastCommitKey: null });` for the `setMode` action.)

Also clear coalescing on selection change so editing a different node starts a new group: in
`setSelection`, `set({ selection, lastCommitKey: null });`.

In `createRound`, reset history: add `past: [], future: [], lastCommitKey: null,` to its
`set({...})`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/store/useRoundStore.test.ts` Expected: PASS, including the new
undo/redo tests. Fix any pre-existing tests that asserted exact `updatedAt` equality if they now
differ (history sets `updatedAt`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): snapshot-based undo/redo with text-edit coalescing"
```

---

### Task 4: undo/redo commands + key bindings

**Files:**

- Modify: `src/lib/commands/registry.ts`
- Modify: `src/lib/commands/commands.ts`
- Modify: `src/lib/keymap/presets.ts`
- Test: `src/lib/commands/commands.test.ts`

- [ ] **Step 1: Add command ids**

In `registry.ts`, add `'edit.undo'` and `'edit.redo'` to the `CommandId` union (near `'edit.exit'`)
and to the `COMMANDS` map:

```ts
  'edit.undo': { id: 'edit.undo', label: 'Undo' },
  'edit.redo': { id: 'edit.redo', label: 'Redo' },
```

- [ ] **Step 2: Write failing test**

Append to `commands.test.ts` (match its existing round-setup pattern):

```ts
it("edit.undo and edit.redo invoke the store", () => {
  // set up a round with one node, then delete it via command
  // (reuse the file's existing helpers to build a round + selection)
  // After deletion, edit.undo restores the node; edit.redo removes it again.
  // Assert via useRoundStore.getState().round!.nodes.length.
});
```

Replace the comment body with a concrete test using the same helpers the file already uses to create
a round, add a node, select it, call `executeCommand('node.delete')`, then assert
`executeCommand('edit.undo')` restores it and `executeCommand('edit.redo')` removes it.

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run src/lib/commands/commands.test.ts` Expected: FAIL — `edit.undo` not handled.

- [ ] **Step 4: Add handlers**

In `commands.ts` `executeCommand` switch, add:

```ts
    case 'edit.undo': {
      useRoundStore.getState().undo();
      return;
    }
    case 'edit.redo': {
      useRoundStore.getState().redo();
      return;
    }
```

- [ ] **Step 5: Add default bindings**

In `src/lib/keymap/presets.ts`, add to BOTH the `default` and `vim` preset normal-mode bindings (use
the existing chord-string format the file uses — match how other Ctrl chords like `Control+r` are
written there):

```ts
  'Control+z': 'edit.undo',
  'Control+Shift+z': 'edit.redo',
```

(If the file already binds `Control+z`/`Control+r` to something, pick an unused chord consistent
with the file and note it in the commit message.)

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/commands/commands.test.ts src/lib/keymap` Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/commands/registry.ts src/lib/commands/commands.ts src/lib/keymap/presets.ts src/lib/commands/commands.test.ts
git commit -m "feat(commands): add undo/redo commands and default bindings"
```

---

### Task 5: Seed scouting/cx + pinned CX sheet in createRound; normalize legacy data

**Files:**

- Modify: `src/lib/store/useRoundStore.ts`
- Create: `src/lib/model/normalize.ts`
- Test: `src/lib/model/normalize.test.ts`
- Modify: `src/lib/persistence/io.ts` (import path) and `src/lib/persistence/autosave.ts` (load
  path)
- Test: `src/lib/model/normalize.test.ts`

- [ ] **Step 1: Write failing test for the normalizer**

```ts
import { describe, it, expect } from "vitest";
import { normalizeRound, emptyScouting, emptyCx } from "./normalize";
import type { Round } from "./types";

function legacy(): any {
  return {
    id: "r1",
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: { id: "f", name: "Policy", speeches: [], prepSeconds: { aff: 0, neg: 0 } },
    meta: {},
    sheets: [{ id: "s1", title: "Aff", group: "aff", order: 0 }],
    nodes: [],
    timers: {
      activeSpeechId: null,
      speechRemaining: null,
      running: false,
      prepRemaining: { aff: 0, neg: 0 },
      prepRunning: null,
    },
    topic: "old topic",
  };
}

describe("normalizeRound", () => {
  it("adds scouting, cx, and a pinned CX sheet when missing", () => {
    const r = normalizeRound(legacy()) as Round;
    expect(r.scouting).toEqual(emptyScouting());
    expect(r.cx).toEqual(emptyCx());
    expect(r.sheets.some((s) => s.kind === "cx")).toBe(true);
  });

  it('defaults existing sheets to kind "flow"', () => {
    const r = normalizeRound(legacy()) as Round;
    const flow = r.sheets.find((s) => s.id === "s1")!;
    expect(flow.kind).toBe("flow");
  });

  it("drops the legacy topic field", () => {
    const r = normalizeRound(legacy()) as any;
    expect(r.topic).toBeUndefined();
  });

  it("does not add a second CX sheet if one exists", () => {
    const base = legacy();
    base.sheets.push({ id: "cx1", title: "CX", group: "aff", order: 1, kind: "cx" });
    const r = normalizeRound(base) as Round;
    expect(r.sheets.filter((s) => s.kind === "cx").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/model/normalize.test.ts` Expected: FAIL — module not found.

- [ ] **Step 3: Implement the normalizer**

`src/lib/model/normalize.ts`:

```ts
import type { Round, Scouting, CxData, Sheet } from "./types";
import { uid } from "./ids";

const emptyDebater = () => ({ first: "", last: "" });

export function emptyScouting(): Scouting {
  return {
    aff: { first: emptyDebater(), second: emptyDebater() },
    neg: { first: emptyDebater(), second: emptyDebater() },
  };
}

export function emptyCx(): CxData {
  return { "1AC": [], "1NC": [], "2AC": [], "2NC": [] };
}

/** A fresh pinned CX sheet. order = -1 so it sorts above flow sheets. */
export function makeCxSheet(): Sheet {
  return { id: uid("sheet"), title: "CX", group: "aff", order: -1, kind: "cx" };
}

/**
 * Normalize a round read from storage/import: fill in new fields, default
 * sheet kind, drop the legacy topic, and ensure exactly one CX sheet exists.
 */
export function normalizeRound(raw: Round): Round {
  const r = { ...raw } as Round & { topic?: unknown };
  delete r.topic;
  if (!r.scouting) r.scouting = emptyScouting();
  if (!r.cx) r.cx = emptyCx();
  r.sheets = r.sheets.map((s) => ({ ...s, kind: s.kind ?? "flow" }));
  if (!r.sheets.some((s) => s.kind === "cx")) {
    r.sheets = [makeCxSheet(), ...r.sheets];
  }
  return r;
}
```

- [ ] **Step 4: Run normalizer tests**

Run: `npx vitest run src/lib/model/normalize.test.ts` Expected: PASS (4 tests).

- [ ] **Step 5: Use it in createRound, import, and load**

In `useRoundStore.ts` `createRound`, build the round with the new fields and seed a CX sheet (import
`emptyScouting`, `emptyCx`, `makeCxSheet` from `@/lib/model/normalize`):

```ts
const round: Round = {
  id: uid("round"),
  createdAt: now,
  updatedAt: now,
  role,
  format,
  meta,
  scouting: emptyScouting(),
  sheets: [makeCxSheet()],
  nodes: [],
  cx: emptyCx(),
  timers: {
    /* unchanged */
  },
};
```

Remove the `topic` parameter from the `createRound` action signature and its `RoundActions` type
(drop `topic?` from the input object).

In `io.ts` `importRoundJSON`, change the final `return round as Round;` to
`return normalizeRound(round as Round);` and add
`import { normalizeRound } from '@/lib/model/normalize';`.

In `autosave.ts` `loadLastRound` (and `loadRound` if it returns to the store), wrap the returned
round with `normalizeRound(...)` before resolving, importing it. (If the round is rendered straight
into the store on load, normalizing here guarantees legacy rounds get a CX sheet + scouting.)

Also update `src/components/AppRoot.tsx`: it currently picks the active sheet as the lowest-`order`
sheet, which is now the CX sheet (`order: -1`). Change that selection to prefer the first **flow**
sheet so reload lands on the flow, not CX:

```ts
const flowSheets = [...r.sheets].filter((s) => s.kind !== "cx").sort((a, b) => a.order - b.order);
const firstSheet = flowSheets[0] ?? [...r.sheets].sort((a, b) => a.order - b.order)[0];
useRoundStore.setState({ round: r, activeSheetId: firstSheet?.id ?? null });
```

- [ ] **Step 6: Run affected tests + types**

Run: `npx vitest run src/lib/persistence src/lib/store/useRoundStore.test.ts && npx tsc --noEmit`
Expected: PASS. `tsc` should now show fewer errors (topic-related call sites in `RoundSetup`/exports
remain until Tasks 14/16).

- [ ] **Step 7: Commit**

```bash
git add src/lib/model/normalize.ts src/lib/model/normalize.test.ts src/lib/store/useRoundStore.ts src/lib/persistence/io.ts src/lib/persistence/autosave.ts src/components/AppRoot.tsx
git commit -m "feat: seed scouting/cx + pinned CX sheet; normalize legacy rounds on load/import"
```

---

## Phase 1 — UI polish (parallelizable after Phase 0)

### Task 6: Settings button in the nav

**Files:**

- Modify: `src/components/RoundHeader.tsx`
- Test: `src/components/RoundHeader.test.tsx`

- [ ] **Step 1: Write failing test**

Add to `RoundHeader.test.tsx`:

```ts
it("opens settings when the settings button is clicked", async () => {
  // render RoundHeader inside a round (reuse the file's existing setup)
  const btn = screen.getByTestId("settings-btn");
  await userEvent.click(btn);
  expect(useRoundStore.getState().settingsOpen).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/components/RoundHeader.test.tsx` Expected: FAIL — no `settings-btn`.

- [ ] **Step 3: Add the button**

In `RoundHeader.tsx`, inside the `no-print` button group, before `<ExportMenu />`:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => useRoundStore.getState().setSettingsOpen(true)}
  aria-label="Settings"
  data-testid="settings-btn"
>
  ⚙
</Button>
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/components/RoundHeader.test.tsx` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RoundHeader.tsx src/components/RoundHeader.test.tsx
git commit -m "feat(ui): add settings button to the nav"
```

---

### Task 7: Flow-sheet aesthetics — centered/larger headers, no em-dash in empty cells

**Files:**

- Modify: `src/components/FlowGrid.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/FlowGrid.test.tsx`

- [ ] **Step 1: Write failing test**

Add to `FlowGrid.test.tsx`:

```ts
it("renders empty cells without an em-dash but still clickable", async () => {
  // render a sheet with at least one empty cell (reuse existing setup)
  // The em-dash placeholder should be gone.
  expect(screen.queryByText("—")).toBeNull();
  // Clicking the empty cell selects it (nodeId === '').
  const emptyCells = document.querySelectorAll("td");
  // click the first empty data cell and assert selection.nodeId === ''
});
```

Flesh out using the file's existing render helper: assert no element with text `—`, then click an
empty `<td>` and assert `useRoundStore.getState().selection?.nodeId === ''`.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/components/FlowGrid.test.tsx` Expected: FAIL — `—` still present.

- [ ] **Step 3: Remove the dash, keep clickability**

In `FlowGrid.tsx`, replace the empty-cell render:

```tsx
return (
  <td
    key={col}
    className={classes}
    onClick={() => setSelection({ sheetId, speechId: speech.id, nodeId: "" })}
  >
    <span className="cell-empty" />
  </td>
);
```

- [ ] **Step 4: Style headers + empty cell in CSS**

In `globals.css`, update/add under the `table.flow` rules:

```css
table.flow th {
  text-align: center;
  font-size: 0.9rem; /* up from the current size */
  font-weight: 600;
}
.cell-empty {
  display: block;
  width: 100%;
  min-height: 1.4em; /* preserves the click target the dash used to provide */
}
```

Remove the now-unused `.dash` rule.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/FlowGrid.test.tsx` Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/FlowGrid.tsx src/app/globals.css src/components/FlowGrid.test.tsx
git commit -m "feat(ui): center/enlarge flow headers; drop em-dash in empty cells"
```

---

### Task 8: Display settings in the store (autoNumber, labelDrops)

**Files:**

- Modify: `src/lib/store/useRoundStore.ts`
- Test: `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("display settings", () => {
  it("defaults autoNumber and labelDrops to true", () => {
    expect(useRoundStore.getState().autoNumber).toBe(true);
    expect(useRoundStore.getState().labelDrops).toBe(true);
  });
  it("setters update state", () => {
    useRoundStore.getState().setAutoNumber(false);
    expect(useRoundStore.getState().autoNumber).toBe(false);
    useRoundStore.getState().setLabelDrops(false);
    expect(useRoundStore.getState().labelDrops).toBe(false);
    useRoundStore.getState().setAutoNumber(true);
    useRoundStore.getState().setLabelDrops(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/store/useRoundStore.test.ts` Expected: FAIL — `autoNumber` undefined.

- [ ] **Step 3: Implement (mirror the keymap-settings persistence pattern)**

Add near the keymap-settings block:

```ts
const DISPLAY_SETTINGS_KEY = "df-display-settings";

interface DisplaySettings {
  autoNumber: boolean;
  labelDrops: boolean;
}

function loadDisplaySettings(): DisplaySettings {
  const fallback: DisplaySettings = { autoNumber: true, labelDrops: true };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      autoNumber: typeof p.autoNumber === "boolean" ? p.autoNumber : true,
      labelDrops: typeof p.labelDrops === "boolean" ? p.labelDrops : true,
    };
  } catch {
    return fallback;
  }
}

function saveDisplaySettings(s: DisplaySettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const initialDisplaySettings = loadDisplaySettings();
```

Add to `RoundState`: `autoNumber: boolean; labelDrops: boolean;` Add to `RoundActions`:
`setAutoNumber(v: boolean): void; setLabelDrops(v: boolean): void;` Initial state:
`autoNumber: initialDisplaySettings.autoNumber, labelDrops: initialDisplaySettings.labelDrops,`
Actions:

```ts
  setAutoNumber(v) { set({ autoNumber: v }); saveDisplaySettings({ autoNumber: v, labelDrops: get().labelDrops }); },
  setLabelDrops(v) { set({ labelDrops: v }); saveDisplaySettings({ autoNumber: get().autoNumber, labelDrops: v }); },
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/lib/store/useRoundStore.test.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): global autoNumber/labelDrops display settings"
```

---

### Task 9: Display section in SettingsPanel + honor toggles in GridCell/Sidebar

**Files:**

- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/components/GridCell.tsx`
- Modify: `src/components/Sidebar.tsx`
- Test: `src/components/SettingsPanel.test.tsx`, `src/components/FlowGrid.test.tsx`

- [ ] **Step 1: Write failing tests**

In `SettingsPanel.test.tsx`:

```ts
it("toggles autoNumber via the display switch", async () => {
  useRoundStore.getState().setSettingsOpen(true);
  // render SettingsPanel
  const sw = screen.getByTestId("toggle-autoNumber");
  await userEvent.click(sw);
  expect(useRoundStore.getState().autoNumber).toBe(false);
});
```

In `FlowGrid.test.tsx`:

```ts
it("hides argument numbers when autoNumber is off", async () => {
  useRoundStore.getState().setAutoNumber(false);
  // render a sheet with a numbered node; assert the "1." prefix is absent
  expect(screen.queryByText("1.")).toBeNull();
  useRoundStore.getState().setAutoNumber(true);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/components/SettingsPanel.test.tsx src/components/FlowGrid.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add Display section to SettingsPanel**

Add subscriptions at the top of the component:

```ts
const autoNumber = useRoundStore((s) => s.autoNumber);
const labelDrops = useRoundStore((s) => s.labelDrops);
const setAutoNumber = useRoundStore((s) => s.setAutoNumber);
const setLabelDrops = useRoundStore((s) => s.setLabelDrops);
```

Insert a Display section above the preset switcher (after the header `</div>`):

```tsx
<div className="shrink-0 border-b border-border px-3.5 py-2.5">
  <div className="pb-2 font-mono text-[9px] font-bold tracking-widest text-zinc-400 uppercase">
    Display
  </div>
  <label className="flex items-center justify-between py-1 text-[13px] text-zinc-900">
    Auto-number arguments
    <input
      type="checkbox"
      checked={autoNumber}
      onChange={(e) => setAutoNumber(e.target.checked)}
      data-testid="toggle-autoNumber"
    />
  </label>
  <label className="flex items-center justify-between py-1 text-[13px] text-zinc-900">
    Label drops
    <input
      type="checkbox"
      checked={labelDrops}
      onChange={(e) => setLabelDrops(e.target.checked)}
      data-testid="toggle-labelDrops"
    />
  </label>
</div>
```

- [ ] **Step 4: Honor toggles in GridCell**

In `GridCell.tsx`, subscribe and gate:

```ts
const autoNumber = useRoundStore((s) => s.autoNumber);
const labelDrops = useRoundStore((s) => s.labelDrops);
```

Change the render: `{autoNumber && num !== null && <span className="arg-num">{num}.</span>}` and
`{labelDrops && isDropped && <> <span className="badge-drop">⚠ dropped</span></>}`.

- [ ] **Step 5: Honor labelDrops in Sidebar**

In `Sidebar.tsx`, subscribe `const labelDrops = useRoundStore(s => s.labelDrops);` and pass
`dropCount={labelDrops ? selectSheetDropCount(round, sheet.id) : 0}` (the badge already hides when
0).

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/SettingsPanel.test.tsx src/components/FlowGrid.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsPanel.tsx src/components/GridCell.tsx src/components/Sidebar.tsx src/components/SettingsPanel.test.tsx src/components/FlowGrid.test.tsx
git commit -m "feat(ui): Display settings section; gate numbers/drop labels"
```

---

## Phase 2 — Scouting / Info (after Phase 0)

### Task 10: `setScouting` store action

**Files:**

- Modify: `src/lib/store/useRoundStore.ts`
- Test: `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("setScouting", () => {
  it("deep-merges a partial and is undoable", () => {
    useRoundStore
      .getState()
      .createRound({ role: "aff", format: makeFormatByKey("policy"), meta: {} });
    useRoundStore.getState().setScouting({ affSchool: "Westwood" });
    expect(useRoundStore.getState().round!.scouting.affSchool).toBe("Westwood");
    useRoundStore.getState().setScouting({ negSchool: "Lincoln" });
    expect(useRoundStore.getState().round!.scouting.affSchool).toBe("Westwood");
    expect(useRoundStore.getState().round!.scouting.negSchool).toBe("Lincoln");
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npx vitest run src/lib/store/useRoundStore.test.ts` →
      FAIL.

- [ ] **Step 3: Implement**

Add to `RoundActions`: `setScouting(patch: Partial<Scouting>): void;` (import `Scouting`). Action —
shallow-merge top-level keys (nested `aff`/`neg`/`decision` replaced wholesale by callers passing
full sub-objects):

```ts
  setScouting(patch) {
    if (!get().round) return;
    get()._commit('scouting', r => ({ ...r, scouting: { ...r.scouting, ...patch } }));
  },
```

(Coalesce key `'scouting'` collapses a burst of field edits into one undo step, consistent with text
coalescing.)

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): setScouting action (undoable)"
```

---

### Task 11: InfoPanel component + info.open command/flag + nav button

**Files:**

- Create: `src/components/InfoPanel.tsx`
- Test: `src/components/InfoPanel.test.tsx`
- Modify: `src/lib/store/useRoundStore.ts` (add `infoOpen` flag + `setInfoOpen`)
- Modify: `src/lib/commands/registry.ts`, `src/lib/commands/commands.ts` (add `info.open`)
- Modify: `src/components/RoundHeader.tsx` (Info button)
- Modify: `src/components/Workspace.tsx` (render `<InfoPanel />`)

- [ ] **Step 1: Add `infoOpen` flag to the store**

In `RoundState`: `infoOpen: boolean;`. Initial: `infoOpen: false,`. In `RoundActions`:
`setInfoOpen(open: boolean): void;`. Action: `setInfoOpen(open) { set({ infoOpen: open }); }`. Reset
to `false` in `createRound`'s `set`.

- [ ] **Step 2: Add the command**

`registry.ts`: add `'info.open'` to the union and
`'info.open': { id: 'info.open', label: 'Open round info' }`. `commands.ts`:
`case 'info.open': { state.setInfoOpen(true); return; }`.

- [ ] **Step 3: Write failing test for InfoPanel**

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import InfoPanel from './InfoPanel';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';

describe('InfoPanel', () => {
  beforeEach(() => {
    useRoundStore.getState().createRound({ role: 'aff', format: makeFormatByKey('policy'), meta: {} });
    useRoundStore.getState().setInfoOpen(true);
  });

  it('edits aff school and shows the generated team code', async () => {
    render(<InfoPanel />);
    await userEvent.type(screen.getByTestId('scout-affSchool'), 'Westwood');
    expect(useRoundStore.getState().round!.scouting.affSchool).toBe('Westwood');
  });

  it('renders nothing when closed', () => {
    useRoundStore.getState().setInfoOpen(false);
    const { container } = render(<InfoPanel />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 4: Run to confirm failure** — `npx vitest run src/components/InfoPanel.test.tsx` → FAIL
      (module not found).

- [ ] **Step 5: Implement InfoPanel**

Model it on `SettingsPanel`'s overlay/modal shell. Fields: aff/neg school; four debaters (1A/2A
first+last, 1N/2N first+last); tournament, round, date, judge; decision vote (aff/neg radio) + RFD
textarea. Each input is controlled from `round.scouting` and writes via `setScouting(...)`
(replacing the relevant nested object for debaters/decision). Show live team-code previews via
`teamCode(scouting.affSchool ?? '', scouting.aff.first, scouting.aff.second)` and the neg
equivalent. Give each input a `data-testid` like `scout-affSchool`, `scout-aff-first-first`, etc.
Close on overlay click / Escape / a ✕ button, gated on `infoOpen`.

`src/components/InfoPanel.tsx`:

```tsx
"use client";

import { useRoundStore } from "@/lib/store/useRoundStore";
import { teamCode } from "@/lib/model/teamCode";
import { Input } from "@/components/ui/input";

export default function InfoPanel() {
  const open = useRoundStore((s) => s.infoOpen);
  const round = useRoundStore((s) => s.round);
  const setInfoOpen = useRoundStore((s) => s.setInfoOpen);
  const setScouting = useRoundStore((s) => s.setScouting);

  if (!open || !round) return null;
  const sc = round.scouting;

  const affCode = teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second);
  const negCode = teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second);

  function close() {
    setInfoOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/30 pt-[8vh]"
      onClick={close}
      data-testid="info-overlay"
    >
      <div
        className="flex max-h-[84vh] w-full max-w-[640px] flex-col overflow-y-auto rounded-[var(--radius)] border border-border bg-card shadow-lg outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Round info"
        data-testid="info-panel"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
          <span className="text-[13px] font-semibold tracking-wide text-zinc-900">Round Info</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close info"
            data-testid="info-close"
            className="rounded px-1.5 py-0.5 text-[13px] text-zinc-400 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4">
          {/* AFF column */}
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[9px] font-bold tracking-widest text-aff uppercase">
              Aff — {affCode || "—"}
            </div>
            <Input
              data-testid="scout-affSchool"
              placeholder="Aff school"
              value={sc.affSchool ?? ""}
              onChange={(e) => setScouting({ affSchool: e.target.value })}
            />
            <DebaterRow
              label="1A"
              value={sc.aff.first}
              onChange={(d) => setScouting({ aff: { ...sc.aff, first: d } })}
              testid="scout-aff-1a"
            />
            <DebaterRow
              label="2A"
              value={sc.aff.second}
              onChange={(d) => setScouting({ aff: { ...sc.aff, second: d } })}
              testid="scout-aff-2a"
            />
          </div>
          {/* NEG column */}
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[9px] font-bold tracking-widest text-neg uppercase">
              Neg — {negCode || "—"}
            </div>
            <Input
              data-testid="scout-negSchool"
              placeholder="Neg school"
              value={sc.negSchool ?? ""}
              onChange={(e) => setScouting({ negSchool: e.target.value })}
            />
            <DebaterRow
              label="1N"
              value={sc.neg.first}
              onChange={(d) => setScouting({ neg: { ...sc.neg, first: d } })}
              testid="scout-neg-1n"
            />
            <DebaterRow
              label="2N"
              value={sc.neg.second}
              onChange={(d) => setScouting({ neg: { ...sc.neg, second: d } })}
              testid="scout-neg-2n"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 pb-3">
          <Input
            data-testid="scout-tournament"
            placeholder="Tournament"
            value={sc.tournament ?? ""}
            onChange={(e) => setScouting({ tournament: e.target.value })}
          />
          <Input
            data-testid="scout-round"
            placeholder="Round"
            value={sc.round ?? ""}
            onChange={(e) => setScouting({ round: e.target.value })}
          />
          <Input
            data-testid="scout-date"
            placeholder="Date"
            value={sc.date ?? ""}
            onChange={(e) => setScouting({ date: e.target.value })}
          />
          <Input
            data-testid="scout-judge"
            placeholder="Judge"
            value={sc.judge ?? ""}
            onChange={(e) => setScouting({ judge: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2 px-4 pb-4">
          <div className="font-mono text-[9px] font-bold tracking-widest text-zinc-400 uppercase">
            Decision
          </div>
          <div className="flex gap-3 text-[13px]" role="group" aria-label="Vote">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="vote"
                checked={sc.decision?.vote === "aff"}
                onChange={() => setScouting({ decision: { ...sc.decision, vote: "aff" } })}
                data-testid="scout-vote-aff"
              />{" "}
              Aff
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="vote"
                checked={sc.decision?.vote === "neg"}
                onChange={() => setScouting({ decision: { ...sc.decision, vote: "neg" } })}
                data-testid="scout-vote-neg"
              />{" "}
              Neg
            </label>
          </div>
          <textarea
            className="cell-input rounded border border-border p-2 text-[13px]"
            rows={3}
            placeholder="RFD"
            value={sc.decision?.rfd ?? ""}
            data-testid="scout-rfd"
            onChange={(e) => setScouting({ decision: { ...sc.decision, rfd: e.target.value } })}
          />
        </div>
      </div>
    </div>
  );
}

function DebaterRow({
  label,
  value,
  onChange,
  testid,
}: {
  label: string;
  value: { first: string; last: string };
  onChange: (d: { first: string; last: string }) => void;
  testid: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[11px] text-zinc-400">{label}</span>
      <Input
        data-testid={`${testid}-first`}
        placeholder="First"
        value={value.first}
        onChange={(e) => onChange({ ...value, first: e.target.value })}
      />
      <Input
        data-testid={`${testid}-last`}
        placeholder="Last"
        value={value.last}
        onChange={(e) => onChange({ ...value, last: e.target.value })}
      />
    </div>
  );
}
```

- [ ] **Step 6: Add the Info nav button**

In `RoundHeader.tsx`, before the settings button:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => useRoundStore.getState().setInfoOpen(true)}
  aria-label="Round info"
  data-testid="info-btn"
>
  Info
</Button>
```

- [ ] **Step 7: Render InfoPanel in Workspace**

In `Workspace.tsx`, add `import InfoPanel from './InfoPanel';` and render `<InfoPanel />` alongside
`<SettingsPanel />`.

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/components/InfoPanel.test.tsx src/components/RoundHeader.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/InfoPanel.tsx src/components/InfoPanel.test.tsx src/components/RoundHeader.tsx src/components/Workspace.tsx src/lib/store/useRoundStore.ts src/lib/commands/registry.ts src/lib/commands/commands.ts
git commit -m "feat(ui): editable Info/scouting panel with team-code preview"
```

---

### Task 12: Trim RoundSetup to role-only

**Files:**

- Modify: `src/components/RoundSetup.tsx`
- Test: `src/components/RoundSetup.test.tsx`

- [ ] **Step 1: Update the test**

Rewrite `RoundSetup.test.tsx` expectations: the form has role buttons and a submit; it no longer
renders topic/opponent/tournament/round/judge/format fields. Submitting creates a round (policy
format) with a CX sheet plus an initial flow sheet. Concretely:

```ts
it('creates a policy round with role only', async () => {
  render(<RoundSetup />);
  await userEvent.click(screen.getByTestId('role-neg'));
  await userEvent.click(screen.getByTestId('submit'));
  const r = useRoundStore.getState().round!;
  expect(r.role).toBe('neg');
  expect(r.format.name).toBe('Policy');
  expect(r.sheets.some(s => s.kind === 'cx')).toBe(true);
});

it('no longer renders the topic field', () => {
  render(<RoundSetup />);
  expect(screen.queryByLabelText(/topic/i)).toBeNull();
});
```

- [ ] **Step 2: Run to confirm failure** — `npx vitest run src/components/RoundSetup.test.tsx` →
      FAIL.

- [ ] **Step 3: Rewrite RoundSetup**

Reduce to role selection + submit. Drop format/topic/opponent/names/tournament/round/judge state and
fields. On submit:

```tsx
function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  createRound({ role, format: makeFormatByKey("policy"), meta: {} });
  // createRound already seeded a pinned CX sheet, so this flow sheet is NOT
  // the first sheet — capture its id and activate it explicitly.
  const id = addSheet({
    title: role === "neg" ? "Neg" : "Aff",
    group: role === "judge" ? "aff" : role,
  });
  useRoundStore.getState().setActiveSheet(id);
}
```

Keep the role fieldset (`role-aff`/`role-neg`/`role-judge`) and the submit button
(`data-testid="submit"`, label "Start Round"). Remove the now-unused imports (`Input`, `Label`,
`FORMAT_PRESETS`, `PresetKey`, topic state, etc.). The Task 12 test must also assert
`useRoundStore.getState().activeSheetId` points at a `kind: 'flow'` sheet after submit.

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RoundSetup.tsx src/components/RoundSetup.test.tsx
git commit -m "feat(ui): trim RoundSetup to role-only; scouting lives in InfoPanel"
```

---

### Task 13: RoundHeader participant string from scouting

**Files:**

- Modify: `src/components/RoundHeader.tsx`
- Test: `src/components/RoundHeader.test.tsx`

- [ ] **Step 1: Update/add test**

```ts
it("shows team codes from scouting", () => {
  useRoundStore
    .getState()
    .createRound({ role: "aff", format: makeFormatByKey("policy"), meta: {} });
  useRoundStore.getState().setScouting({
    affSchool: "Westwood",
    aff: { first: { first: "Al", last: "Smith" }, second: { first: "Bo", last: "Jones" } },
  });
  // render RoundHeader; participant text includes "Westwood JS"
  expect(screen.getByTestId("round-header").textContent).toContain("Westwood JS");
});
```

- [ ] **Step 2: Run to confirm failure** — FAIL.

- [ ] **Step 3: Derive participants from scouting**

Replace the `meta`-based `participants` computation with scouting + `teamCode`:

```tsx
const { role, scouting } = round;
const affCode =
  teamCode(scouting.affSchool ?? "", scouting.aff.first, scouting.aff.second) || "Aff";
const negCode =
  teamCode(scouting.negSchool ?? "", scouting.neg.first, scouting.neg.second) || "Neg";
const participants =
  role === "judge"
    ? `${affCode} (Aff) vs ${negCode} (Neg)`
    : role === "neg"
      ? `${negCode} vs ${affCode}`
      : `${affCode} vs ${negCode}`;
```

Add `import { teamCode } from '@/lib/model/teamCode';`. Remove the old `meta`-based block.

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RoundHeader.tsx src/components/RoundHeader.test.tsx
git commit -m "feat(ui): derive header participants from scouting team codes"
```

---

### Task 14: Excel Info-sheet population from scouting; remove topic from exports

**Files:**

- Modify: `src/lib/export/xlsx.ts`
- Test: `src/lib/export/xlsx.test.ts`

Verified Info-sheet cell map (template `public/templates/Flow.xlsx`, sheet "Info"): `D5` aff school,
`H5` neg school; `D8`/`E8` 1A first/last, `D9`/`E9` 2A first/last; `H8`/`I8` 1N first/last,
`H9`/`I9` 2N first/last; `D11` tournament; `D12` judge name; `D13` date; `F16` first-judge vote
(`AFF`/`NEG`); `D32` RFD. Team-code cells `D3`/`H3` hold formulas and need no writing.

- [ ] **Step 1: Write failing test**

In `xlsx.test.ts` (it already builds with the template bytes — reuse that fixture loader):

```ts
it('writes scouting fields into the Info sheet', () => {
  const round = /* build a round via the file's helper */;
  round.scouting = {
    affSchool: 'Westwood', negSchool: 'Lincoln',
    aff: { first: { first: 'Al', last: 'Smith' }, second: { first: 'Bo', last: 'Jones' } },
    neg: { first: { first: 'Cy', last: 'Diaz' }, second: { first: 'Di', last: 'Eaton' } },
    tournament: 'Berkeley', round: '3', date: '2026-06-03', judge: 'Pat Lee',
    decision: { vote: 'aff', rfd: 'Clear on impacts.' },
  };
  const bytes = buildXlsx(round, templateBytes);
  const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
  expect(xml).toContain('Westwood');
  expect(xml).toContain('Lincoln');
  expect(xml).toContain('Smith');
  expect(xml).toContain('Clear on impacts.');
});
```

- [ ] **Step 2: Run to confirm failure** — `npx vitest run src/lib/export/xlsx.test.ts` → FAIL.

- [ ] **Step 3: Rewrite `patchInfo`**

```ts
function patchInfo(infoXml: string, round: Round): string {
  let xml = infoXml;
  const sc = round.scouting;
  const set = (ref: string, v?: string) => {
    if (v && v.trim()) xml = setCellInline(xml, ref, v);
  };

  set("D5", sc.affSchool);
  set("H5", sc.negSchool);
  set("D8", sc.aff.first.first);
  set("E8", sc.aff.first.last);
  set("D9", sc.aff.second.first);
  set("E9", sc.aff.second.last);
  set("H8", sc.neg.first.first);
  set("I8", sc.neg.first.last);
  set("H9", sc.neg.second.first);
  set("I9", sc.neg.second.last);
  set("D11", sc.tournament);
  set("D12", sc.judge);
  set("D13", sc.date || isoDate(round.createdAt));
  if (sc.decision?.vote) set("F16", sc.decision.vote.toUpperCase());
  set("D32", sc.decision?.rfd);
  return xml;
}
```

Search `xlsx.ts` and the rest of `src/lib/export/` for any remaining `round.topic` / `meta.opponent`
/ `meta.affName` references and remove them (the new `patchInfo` no longer reads `meta`). Verify
`pdf.ts` and `cells.ts` don't read `topic`; if they do, switch to scouting or drop it.

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/export` → PASS. Then `npx tsc --noEmit` should
      now be clean of topic errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/xlsx.ts src/lib/export/xlsx.test.ts
git commit -m "feat(export): populate Info sheet from scouting; drop topic"
```

---

## Phase 3 — CX sheet (after Phase 0)

### Task 15: CX store actions

**Files:**

- Modify: `src/lib/store/useRoundStore.ts`
- Test: `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("cx actions", () => {
  beforeEach(() => {
    useRoundStore
      .getState()
      .createRound({ role: "aff", format: makeFormatByKey("policy"), meta: {} });
  });
  it("adds, updates, and removes a CX row", () => {
    const id = useRoundStore.getState().addCxRow("1AC");
    expect(useRoundStore.getState().round!.cx["1AC"].length).toBe(1);
    useRoundStore.getState().updateCxRow("1AC", id, { question: "Why?" });
    expect(useRoundStore.getState().round!.cx["1AC"][0].question).toBe("Why?");
    useRoundStore.getState().removeCxRow("1AC", id);
    expect(useRoundStore.getState().round!.cx["1AC"].length).toBe(0);
  });
  it("row edits are undoable", () => {
    const id = useRoundStore.getState().addCxRow("1NC");
    useRoundStore.getState().undo();
    expect(useRoundStore.getState().round!.cx["1NC"].length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — FAIL.

- [ ] **Step 3: Implement**

Add to `RoundActions` (import `CxPeriod`, `CxRow`):

```ts
  addCxRow(period: CxPeriod): string;
  updateCxRow(period: CxPeriod, id: string, patch: Partial<Omit<CxRow, 'id'>>): void;
  removeCxRow(period: CxPeriod, id: string): void;
```

Actions:

```ts
  addCxRow(period) {
    const id = uid('cx');
    get()._commit(null, r => ({
      ...r,
      cx: { ...r.cx, [period]: [...r.cx[period], { id, question: '', response: '' }] },
    }));
    return id;
  },
  updateCxRow(period, id, patch) {
    if (!get().round) return;
    get()._commit(`cx:${id}`, r => ({
      ...r,
      cx: { ...r.cx, [period]: r.cx[period].map(row => row.id === id ? { ...row, ...patch } : row) },
    }));
  },
  removeCxRow(period, id) {
    if (!get().round) return;
    get()._commit(null, r => ({
      ...r,
      cx: { ...r.cx, [period]: r.cx[period].filter(row => row.id !== id) },
    }));
  },
```

- [ ] **Step 4: Run test** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): CX row add/update/remove (undoable)"
```

---

### Task 16: CxSheet component + Workspace routing by kind

**Files:**

- Create: `src/components/CxSheet.tsx`
- Test: `src/components/CxSheet.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write failing test**

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import CxSheet from './CxSheet';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';

describe('CxSheet', () => {
  beforeEach(() => {
    useRoundStore.getState().createRound({ role: 'aff', format: makeFormatByKey('policy'), meta: {} });
  });
  it('renders the four CX period columns', () => {
    render(<CxSheet />);
    ['1AC CX', '1NC CX', '2AC CX', '2NC CX'].forEach(h => expect(screen.getByText(h)).toBeTruthy());
  });
  it('adds a row and edits the question', async () => {
    render(<CxSheet />);
    await userEvent.click(screen.getByTestId('cx-add-1AC'));
    expect(useRoundStore.getState().round!.cx['1AC'].length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — FAIL (module not found).

- [ ] **Step 3: Implement CxSheet**

```tsx
"use client";

import { useRoundStore } from "@/lib/store/useRoundStore";
import type { CxPeriod } from "@/lib/model/types";
import { Button } from "@/components/ui/button";

const PERIODS: CxPeriod[] = ["1AC", "1NC", "2AC", "2NC"];

export default function CxSheet() {
  const round = useRoundStore((s) => s.round);
  const addCxRow = useRoundStore((s) => s.addCxRow);
  const updateCxRow = useRoundStore((s) => s.updateCxRow);
  const removeCxRow = useRoundStore((s) => s.removeCxRow);
  if (!round) return null;

  return (
    <div className="grid grid-cols-4 gap-4" data-testid="cx-sheet">
      {PERIODS.map((period) => (
        <div key={period} className="flex flex-col gap-2">
          <div className="text-center text-[0.9rem] font-semibold">{period} CX</div>
          {round.cx[period].map((row) => (
            <div key={row.id} className="flex flex-col gap-1 rounded border border-border p-1.5">
              <input
                className="cell-input text-[13px]"
                placeholder="Question"
                value={row.question}
                onChange={(e) => updateCxRow(period, row.id, { question: e.target.value })}
                data-testid={`cx-q-${row.id}`}
              />
              <input
                className="cell-input text-[13px]"
                placeholder="Response"
                value={row.response}
                onChange={(e) => updateCxRow(period, row.id, { response: e.target.value })}
                data-testid={`cx-r-${row.id}`}
              />
              <button
                type="button"
                className="self-end text-[11px] text-zinc-400 hover:text-zinc-600"
                onClick={() => removeCxRow(period, row.id)}
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addCxRow(period)}
            data-testid={`cx-add-${period}`}
          >
            + Q/A
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Route in Workspace**

In `Workspace.tsx`, determine the active sheet's kind and pick the renderer:

```tsx
const round = useRoundStore((s) => s.round);
const activeSheet = round?.sheets.find((s) => s.id === activeSheetId) ?? null;
```

Replace the `<FlowGrid .../>` branch:

```tsx
{
  activeSheet?.kind === "cx" ? (
    <CxSheet />
  ) : activeSheetId ? (
    <FlowGrid sheetId={activeSheetId} />
  ) : (
    <div className="p-6 text-[13px] text-zinc-400">No sheet selected</div>
  );
}
```

Add `import CxSheet from './CxSheet';`. Note: the existing `useEffect` that auto-selects a node
should skip CX sheets — guard it with `if (activeSheet?.kind === 'cx') return;` (CX has no grid
nodes).

- [ ] **Step 5: Run tests** — `npx vitest run src/components/CxSheet.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CxSheet.tsx src/components/CxSheet.test.tsx src/components/Workspace.tsx
git commit -m "feat(ui): CX sheet with per-period Q/A rows; route by sheet kind"
```

---

### Task 17: Pin CX sheet in the sidebar; add sheet-delete affordance

**Files:**

- Modify: `src/components/Sidebar.tsx`
- Test: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write failing tests**

```ts
it("pins the CX sheet above the aff/neg groups and it is not deletable", () => {
  // createRound (seeds a CX sheet); render Sidebar
  expect(screen.getByTestId("cx-sheet-row")).toBeTruthy();
  expect(screen.queryByTestId(/^delete-sheet-/)).not.toBeNull(); // flow sheets have delete
  // the CX row has no delete affordance
});

it("deletes a flow sheet when its × is clicked (undoable)", async () => {
  // add a flow sheet, render, click its delete ×, assert it is gone
  // then useRoundStore.getState().undo() restores it
});
```

Flesh these out with the file's existing render helper.

- [ ] **Step 2: Run to confirm failure** — FAIL.

- [ ] **Step 3: Pin CX + add delete affordance**

In `Sidebar.tsx`: select the CX sheet and render it at the top:

```tsx
const cxSheet = round.sheets.find((s) => s.kind === "cx") ?? null;
```

Above the `GROUPS.map(...)` block, render a pinned row:

```tsx
{
  cxSheet && (
    <button
      type="button"
      onClick={() => setActiveSheet(cxSheet.id)}
      aria-current={cxSheet.id === activeSheetId ? "true" : undefined}
      data-testid="cx-sheet-row"
      className={cn(
        "mb-3 flex w-full items-center rounded-md border px-2 py-1.5 text-left text-[13px]",
        cxSheet.id === activeSheetId
          ? "border-zinc-200 bg-zinc-100 font-semibold text-zinc-900"
          : "border-transparent text-zinc-700 hover:bg-zinc-50",
      )}
    >
      {cxSheet.title}
    </button>
  );
}
```

Ensure flow sheets are listed by filtering out CX: `selectSheetsByGroup` already filters by group;
CX has `group:'aff'` so exclude `kind==='cx'`. Update the group list to
`selectSheetsByGroup(round, group).filter(s => s.kind !== 'cx')`.

Add a delete `×` to `SheetRow` (non-renaming branch). Pass an `onDelete` prop and render a button
revealed on hover that stops propagation:

```tsx
<span
  role="button"
  aria-label="Delete sheet"
  data-testid={`delete-sheet-${sheet.id}`}
  onClick={(e) => {
    e.stopPropagation();
    onDelete();
  }}
  className="px-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-500"
>
  ×
</span>
```

Add `group` to the row's container className (so `group-hover` works) and wire
`onDelete={() => removeSheet(sheet.id)}` from the list
(`const removeSheet = useRoundStore(s => s.removeSheet);`). CX is rendered separately and has no
delete affordance.

- [ ] **Step 4: Run tests** — `npx vitest run src/components/Sidebar.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat(ui): pin CX sheet; add hover delete (undoable) to flow sheets"
```

---

### Task 18: Export CX sheet to Excel

**Files:**

- Modify: `src/lib/export/xlsx.ts`
- Test: `src/lib/export/xlsx.test.ts`

The template "CX" sheet has period headers `1AC CX`/`1NC CX`/`2AC CX`/`2NC CX` with
`Question`/`Response` columns beneath each. This task writes the app's CX rows into that sheet.

- [ ] **Step 1: Inspect the CX sheet cell layout**

Run (one-time, to map cells precisely before writing the patcher):

```bash
cd /tmp && rm -rf cxmap && mkdir cxmap && cd cxmap && unzip -oq /Users/shreeram/Documents/src/github.com/shreerammodi/debate-flow/public/templates/Flow.xlsx && cat xl/worksheets/sheet5.xml | tr '<' '\n<' | grep -E 'c r=|v>' | head -80
```

(Sheet "CX" is `rId5`; resolve its part via `resolveSheetPart(workbookXml, relsXml, 'CX')` in code
rather than hardcoding `sheet5.xml`.) Identify the first data row and the two columns per period
(Question col, Response col).

- [ ] **Step 2: Write failing test**

```ts
it('writes CX rows into the CX sheet', () => {
  const round = /* build via helper */;
  round.cx['1AC'] = [{ id: 'a', question: 'Why plan?', response: 'Because.' }];
  const bytes = buildXlsx(round, templateBytes);
  const files = unzipSync(bytes);
  const cxPart = /* resolve CX part name the same way the code does */;
  const xml = strFromU8(files[`xl/worksheets/${cxPart}`]);
  expect(xml).toContain('Why plan?');
  expect(xml).toContain('Because.');
});
```

- [ ] **Step 3: Run to confirm failure** — FAIL.

- [ ] **Step 4: Implement `patchCx` and call it in `buildXlsx`**

Add a `patchCx(cxXml, round)` that, for each period, writes successive rows' question/response into
the mapped columns starting at the first data row (using `setCellInline` and `colLetter`-style refs
from the layout found in Step 1). In `buildXlsx`, resolve the CX part
(`const cxPart = resolveSheetPart(workbookXml, relsXml, 'CX');`) and apply:
`files[\`xl/worksheets/${cxPart}\`] = strToU8(patchCx(strFromU8(files[\`xl/worksheets/${cxPart}\`]),
round));`placed next to the`patchInfo` call.

- [ ] **Step 5: Run tests** — `npx vitest run src/lib/export/xlsx.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/xlsx.ts src/lib/export/xlsx.test.ts
git commit -m "feat(export): write CX rows into the Excel CX sheet"
```

---

## Final verification

- [ ] **Run the full suite, lint, and type-check**

```bash
npx vitest run && npm run lint && npx tsc --noEmit
```

Expected: all tests pass, lint clean, no type errors. Investigate and fix any pre-existing failures
noted in build-progress memory (stale keymap tests / readonly-array tsc errors) only if this work
touched those files; otherwise leave them and note them.

- [ ] **Manual smoke (optional, via the /run skill):** new round → fill Info → verify header team
      codes → add args, delete a cell + a sheet, undo both → toggle auto-number/label-drops in
      Settings → add CX Q/A → export Excel and open it.
