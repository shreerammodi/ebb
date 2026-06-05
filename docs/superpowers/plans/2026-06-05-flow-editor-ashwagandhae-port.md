# Flow Editor — ashwagandhae-feel port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the flow editor feel like ashwagandhae/debate-flow — fluid physical arrow navigation, modeless single-line cells, roots in any column — without rebuilding the proven layout/export engine.

**Architecture:** Keep the existing `buildLayout` rowspan engine and `<table class="flow">` renderer (they already produce the band layout, handle roots-anywhere, and are shared with the exporters). Fix the three things that are actually clunky: navigation (make ↑/↓ physical/placement-aware across bands), root ordering (sheet-wide so a later-column root can sit above an earlier one), and the keymap/visual polish. Cells become strictly single-line. No new model fields.

**Tech Stack:** Next.js + React, Zustand store, Vitest, Dexie (IndexedDB), TypeScript.

**Divergence from the 2026-06-05 spec (user-approved 2026-06-05):** The spec suggested a recursive-component rewrite plus new `empty`/`isExtension` fields. Per the user's planning-time decision, this plan instead **keeps `buildLayout`** (it already is the shared placement function and already does bands + roots-anywhere) and **adds no fields** — spacing uses normal empty-text nodes, and "extension" reuses the existing `'extended'` status (which already renders `↳` inside a cell, satisfying "everything is a cell"). All other spec goals are unchanged.

**Before starting:** This runs on a feature branch/worktree (created via superpowers:using-git-worktrees at execution time). First run `npm test` and confirm the suite is green so later failures are attributable to this work. Note: per memory, `main` has some pre-existing red tests (4 stale keymap tests, 6 tsc errors in `AppRoot.test.tsx`/`autosave.test.ts`); record the baseline counts before changing anything.

---

## File Structure

- `src/lib/model/tree.ts` — MODIFY: sheet-wide root ordering in `addNode`; strip newlines in `updateText`.
- `src/lib/grid/layout.ts` — MODIFY: sort roots by `order` only (not by column).
- `src/lib/grid/navigation.ts` — MODIFY: add `adjacentInColumn(placed, nodeId, dir)`.
- `src/lib/commands/commands.ts` — MODIFY: rewire `move.up`/`move.down` to placement adjacency.
- `src/lib/persistence/db.ts` — MODIFY: add Dexie `version(4)` upgrade collapsing newlines in `node.text`.
- `src/lib/keymap/presets.ts` — MODIFY: add default-keymap bindings for conceded/extended.
- `src/components/GridCell.tsx` — MODIFY: drop the Ctrl+Enter in-cell newline; Backspace-on-empty deletes.
- `src/components/FlowGrid.tsx` — MODIFY: per-column header "+" to add a root in that column.
- `src/app/globals.css` — MODIFY: Excel-tight grid refinement.

Each task is its own commit. Run `npx prettier --write <files>` before committing if `npm run format:check` would complain.

---

## Phase 1 — Model

### Task 1: Sheet-wide root ordering

A root (`parentId === null`) must order against **all roots on the sheet**, so a root created in a later column can sit anywhere vertically (roots-anywhere). Children keep per-column ordering (unchanged).

**Files:**
- Modify: `src/lib/model/tree.ts` (the `addNode` function, lines ~43-83)
- Test: `src/lib/model/tree.test.ts` (existing file — add cases; if root-ordering cases there assume per-column, update them)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/model/tree.test.ts`:

```ts
import { addNode } from "@/lib/model/tree";
import type { ArgumentNode } from "@/lib/model/types";

describe("addNode root ordering (sheet-wide)", () => {
  it("orders roots across the whole sheet, not per column", () => {
    let nodes: ArgumentNode[] = [];
    const a = addNode(nodes, { sheetId: "s", speechId: "1ac", parentId: null });
    nodes = a.nodes;
    const b = addNode(nodes, { sheetId: "s", speechId: "1nc", parentId: null });
    nodes = b.nodes;
    expect(a.node.order).toBe(0);
    // sheet-wide: the 1NC root is the 2nd root, so order 1 (not 0 again)
    expect(b.node.order).toBe(1);
  });

  it("still orders children within their own column", () => {
    let nodes: ArgumentNode[] = [];
    const root = addNode(nodes, { sheetId: "s", speechId: "1ac", parentId: null });
    nodes = root.nodes;
    const c1 = addNode(nodes, { sheetId: "s", speechId: "1nc", parentId: root.node.id });
    nodes = c1.nodes;
    const c2 = addNode(nodes, { sheetId: "s", speechId: "1nc", parentId: root.node.id });
    expect(c1.node.order).toBe(0);
    expect(c2.node.order).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/model/tree.test.ts -t "sheet-wide"`
Expected: FAIL — `b.node.order` is `0` (current code orders within `1nc` column only).

- [ ] **Step 3: Implement sheet-wide root ordering**

In `src/lib/model/tree.ts`, replace the body of `addNode` from the `const column = ...` line through the `newOrder/updatedNodes` computation with a scope predicate:

```ts
  const isRoot = input.parentId === null;
  // Roots order against ALL roots on the sheet (roots-anywhere); children order
  // within their own (sheet, speech) column.
  const inScope = (n: ArgumentNode): boolean =>
    isRoot
      ? n.sheetId === input.sheetId && n.parentId === null
      : n.sheetId === input.sheetId && n.speechId === input.speechId;

  const scope = nodes.filter(inScope);

  let newOrder: number;
  let updatedNodes: ArgumentNode[];

  if (input.insertAfterOrder !== undefined) {
    newOrder = input.insertAfterOrder + 1;
    updatedNodes = nodes.map((n) =>
      inScope(n) && n.order >= newOrder ? { ...n, order: n.order + 1 } : n,
    );
  } else {
    newOrder = scope.length > 0 ? Math.max(...scope.map((n) => n.order)) + 1 : 0;
    updatedNodes = [...nodes];
  }
```

Leave the `node` object literal and `return` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/model/tree.test.ts`
Expected: PASS (new cases + existing). If an existing case asserted a 2nd-column root got order 0, update it to the sheet-wide value.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model/tree.ts src/lib/model/tree.test.ts
git commit -m "feat(editor): order roots sheet-wide so roots can start in any column"
```

### Task 2: Single-line cells — strip newlines in updateText

**Files:**
- Modify: `src/lib/model/tree.ts` (`updateText`, lines ~100-102)
- Test: `src/lib/model/tree.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { updateText } from "@/lib/model/tree";

describe("updateText single-line", () => {
  it("collapses newlines to spaces so cells stay one line", () => {
    const nodes = [
      { id: "n1", sheetId: "s", speechId: "1ac", parentId: null, order: 0,
        text: "", statuses: [], bold: false, numberOverride: null },
    ] as any;
    const out = updateText(nodes, "n1", "tag\ncite\r\nmore");
    expect(out[0].text).toBe("tag cite more");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/model/tree.test.ts -t "single-line"`
Expected: FAIL — text retains `\n`.

- [ ] **Step 3: Implement**

In `src/lib/model/tree.ts`, change `updateText`:

```ts
export function updateText(nodes: ArgumentNode[], nodeId: string, text: string): ArgumentNode[] {
  const oneLine = text.replace(/\r?\n|\r/g, " ");
  return nodes.map((n) => (n.id === nodeId ? { ...n, text: oneLine } : n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/model/tree.test.ts -t "single-line"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/model/tree.ts src/lib/model/tree.test.ts
git commit -m "feat(editor): enforce single-line cell text in updateText"
```

### Task 3: Dexie v4 — collapse newlines in existing nodes

**Files:**
- Modify: `src/lib/persistence/db.ts` (after the `version(3)` block, line ~43)
- Test: `src/lib/persistence/db.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/persistence/db.test.ts` (follow the file's existing upgrade-test pattern; this is the shape):

```ts
import { DebateFlowDB } from "@/lib/persistence/db";

it("v4 collapses newlines in node text to single lines", async () => {
  const db = new DebateFlowDB("df-test-v4");
  await db.open();
  await db.rounds.add({
    id: "r1", createdAt: 0, updatedAt: 0, role: "aff",
    format: { id: "f", name: "f", speeches: [], prepSeconds: { aff: 0, neg: 0 } },
    meta: {}, scouting: {} as any, sheets: [], groups: [],
    nodes: [{ id: "n1", sheetId: "s", speechId: "1ac", parentId: null, order: 0,
      text: "tag\ncite", statuses: [], bold: false, numberOverride: null }],
    timers: { activeSpeechId: null, speechRemaining: null, running: false,
      prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  } as any);
  const r = await db.rounds.get("r1");
  expect(r!.nodes[0].text).toBe("tag cite");
  await db.delete();
});
```

> Note: a freshly-opened DB runs all upgrades, so the modify runs on the seeded row. If the existing test file seeds rounds before `db.open()` differently, match that pattern instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/persistence/db.test.ts -t "v4"`
Expected: FAIL — text still contains `\n`.

- [ ] **Step 3: Implement the upgrade**

In `src/lib/persistence/db.ts`, after the `this.version(3)...` block and before the closing `}` of the constructor:

```ts
    this.version(4).upgrade((tx) =>
      tx
        .table("rounds")
        .toCollection()
        .modify((r: { nodes?: Array<{ text?: string }> }) => {
          if (Array.isArray(r.nodes)) {
            r.nodes = r.nodes.map((n) => ({
              ...n,
              text: typeof n.text === "string" ? n.text.replace(/\r?\n|\r/g, " ") : n.text,
            }));
          }
        }),
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/persistence/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/persistence/db.ts src/lib/persistence/db.test.ts
git commit -m "feat(editor): Dexie v4 collapses legacy multi-line node text"
```

---

## Phase 2 — Layout: roots by sheet-wide order

### Task 4: buildLayout sorts roots by order only

**Files:**
- Modify: `src/lib/grid/layout.ts` (the `roots` sort, lines ~44-48)
- Test: `src/lib/grid/layout.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/grid/layout.test.ts`:

```ts
import { buildLayout } from "@/lib/grid/layout";
import type { ArgumentNode, Speech } from "@/lib/model/types";

const sp = (id: string, side: "aff" | "neg"): Speech => ({ id, name: id, side, seconds: 0 });
const node = (id: string, speechId: string, order: number): ArgumentNode => ({
  id, sheetId: "s", speechId, parentId: null, order, text: id,
  statuses: [], bold: false, numberOverride: null,
});

it("places roots by sheet-wide order, not by column", () => {
  const speeches = [sp("1ac", "aff"), sp("1nc", "neg")];
  // 'a' is in a LATER column but has the LOWER order → must sit on top.
  const nodes = [node("a", "1nc", 0), node("b", "1ac", 1)];
  const { placed } = buildLayout(nodes, speeches);
  const a = placed.find((p) => p.node.id === "a")!;
  const b = placed.find((p) => p.node.id === "b")!;
  expect(a.startRow).toBe(0);
  expect(a.col).toBe(1);
  expect(b.startRow).toBe(1);
  expect(b.col).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/grid/layout.test.ts -t "sheet-wide order"`
Expected: FAIL — current `(col, order)` sort puts `b` (col 0) first at row 0.

- [ ] **Step 3: Implement**

In `src/lib/grid/layout.ts`, replace the `roots` sort:

```ts
  // Roots: nodes with parentId === null, stacked by their sheet-wide order so a
  // root created in any column can sit anywhere vertically (roots-anywhere).
  const roots = (childrenByParent.get(null) ?? []).slice().sort((a, b) => a.order - b.order);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/grid/layout.test.ts`
Expected: PASS. Existing band/leafcount tests stay green (they place a single root chain, unaffected by root sort).

- [ ] **Step 5: Commit**

```bash
git add src/lib/grid/layout.ts src/lib/grid/layout.test.ts
git commit -m "feat(editor): stack roots by sheet-wide order in buildLayout"
```

---

## Phase 3 — Navigation: physical ↑/↓ across bands

### Task 5: `adjacentInColumn` placement-aware neighbor

The current `nodeAboveInColumn`/`nodeBelowInColumn` compare raw `order` within `(sheet, speech)`, which is wrong across bands (a child's order is per-parent). Use `buildLayout`'s placement (`startRow`, `col`) for true physical adjacency.

**Files:**
- Modify: `src/lib/grid/navigation.ts` (add a function; keep `parentOf`/`firstChildOf`)
- Test: `src/lib/grid/navigation.test.ts` (existing — `src/lib/search/entries.test.ts` etc. unaffected)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/grid/navigation.test.ts`:

```ts
import { adjacentInColumn } from "@/lib/grid/navigation";
import type { PlacedNode } from "@/lib/grid/layout";
import type { ArgumentNode } from "@/lib/model/types";

const an = (id: string): ArgumentNode => ({
  id, sheetId: "s", speechId: "1ac", parentId: null, order: 0, text: id,
  statuses: [], bold: false, numberOverride: null,
});
const placed = (id: string, startRow: number, col: number): PlacedNode => ({
  node: an(id), startRow, rowSpan: 1, col,
});

it("finds the nearest box above/below in the same column by screen row", () => {
  const ps = [placed("top", 0, 0), placed("mid", 3, 0), placed("bot", 7, 0), placed("other", 1, 1)];
  expect(adjacentInColumn(ps, "mid", "up")!.id).toBe("top");
  expect(adjacentInColumn(ps, "mid", "down")!.id).toBe("bot");
  expect(adjacentInColumn(ps, "top", "up")).toBeNull();
  expect(adjacentInColumn(ps, "bot", "down")).toBeNull();
  // never crosses into another column
  expect(adjacentInColumn(ps, "top", "down")!.id).toBe("mid");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/grid/navigation.test.ts -t "above/below"`
Expected: FAIL — `adjacentInColumn` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/grid/navigation.ts`:

```ts
import type { PlacedNode } from "@/lib/grid/layout";

/**
 * Returns the placed node physically above/below `nodeId` in the SAME column,
 * by screen row (`startRow`) — the true visual neighbor across band boundaries.
 * Null at the column's vertical edge. Never crosses columns.
 */
export function adjacentInColumn(
  placed: PlacedNode[],
  nodeId: string,
  dir: "up" | "down",
): ArgumentNode | null {
  const cur = placed.find((p) => p.node.id === nodeId);
  if (!cur) return null;
  const sameCol = placed.filter((p) => p.col === cur.col && p.node.id !== nodeId);
  if (dir === "up") {
    const above = sameCol.filter((p) => p.startRow < cur.startRow);
    if (above.length === 0) return null;
    return above.reduce((best, p) => (p.startRow > best.startRow ? p : best)).node;
  }
  const below = sameCol.filter((p) => p.startRow > cur.startRow);
  if (below.length === 0) return null;
  return below.reduce((best, p) => (p.startRow < best.startRow ? p : best)).node;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/grid/navigation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/grid/navigation.ts src/lib/grid/navigation.test.ts
git commit -m "feat(editor): add placement-aware adjacentInColumn navigation"
```

### Task 6: Wire move.up/move.down to placement adjacency

**Files:**
- Modify: `src/lib/commands/commands.ts` (the `move.*` case, lines ~53-77)
- Test: `src/lib/commands/commands.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/commands/commands.test.ts`, inside the existing `describe("move.down / move.up", ...)` block. It reuses the file's `setupRound()` helper but adds an **aff** sheet (an aff sheet's columns start at `speeches[0]`, so parent/child columns are both in range — a neg sheet starts at 1NC and would exclude `speeches[0]`):

```ts
  it("move.down crosses bands by physical placement, not per-column order", () => {
    setupRound();
    const store = () => useRoundStore.getState();
    const fmt = store().round!.format;
    const sheetId = store().addSheet({ title: "Case", group: "aff" });
    const pCol = fmt.speeches[0].id; // parent column
    const cCol = fmt.speeches[1].id; // child column (one to the right)

    const A = store().addNode({ sheetId, speechId: pCol, parentId: null });
    const a1 = store().addNode({ sheetId, speechId: cCol, parentId: A });
    const B = store().addNode({ sheetId, speechId: pCol, parentId: null });
    const b1 = store().addNode({ sheetId, speechId: cCol, parentId: B });

    // a1 and b1 are BOTH first-children (order 0 within their parent), but a1 is
    // physically above b1. Old order-based logic returns null; placement returns b1.
    store().setSelection({ sheetId, speechId: cCol, nodeId: a1 });
    executeCommand("move.down");
    expect(store().selection?.nodeId).toBe(b1);
  });
```

> Why it fails today: `nodeBelowInColumn(a1)` filters same `speechId` with `order > a1.order(0)`; `b1` also has order 0, so the old code finds nothing. Placement adjacency sees `b1` one band lower in the same column.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/commands/commands.test.ts -t "move.down steps"`
Expected: FAIL with the old logic.

- [ ] **Step 3: Implement**

In `src/lib/commands/commands.ts`, add imports at the top:

```ts
import { adjacentInColumn } from "@/lib/grid/navigation";
import { buildLayout } from "@/lib/grid/layout";
import { columnsForSheet } from "@/lib/grid/columns";
```

Replace the `move.up`/`move.down` branch inside the `move.*` case:

```ts
      let target: ArgumentNode | null = null;
      if (id === "move.up" || id === "move.down") {
        const sheetNodes = round.nodes.filter((n) => n.sheetId === node.sheetId);
        const sheet = round.sheets.find((s) => s.id === node.sheetId);
        const speeches = isCxSheet(round, node.sheetId)
          ? CX_COLUMNS
          : sheet
            ? columnsForSheet(round.format, sheet)
            : round.format.speeches;
        const { placed } = buildLayout(sheetNodes, speeches);
        target = adjacentInColumn(placed, node.id, id === "move.up" ? "up" : "down");
      } else if (id === "move.left") {
        target = parentOf(round.nodes, node.id);
      } else {
        target = firstChildOf(round.nodes, node.id, node.sheetId);
      }
```

(`CX_COLUMNS` is already imported in this file; `nodeAboveInColumn`/`nodeBelowInColumn` imports may now be unused — remove them from the import list if so, since `node.delete` below also uses them. **Check:** `node.delete` still calls `nodeAboveInColumn`/`nodeBelowInColumn` — keep those imports.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/commands/commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/commands.ts src/lib/commands/commands.test.ts
git commit -m "feat(editor): physical up/down navigation via placement"
```

---

## Phase 4 — Editing & keymap

### Task 7: Single-line cell + Backspace-on-empty deletes

Remove the Ctrl+Enter in-cell newline (cells are single-line now) and make Backspace on an empty cell delete the node (ashwagandhae behavior).

**Files:**
- Modify: `src/components/GridCell.tsx` (the textarea `onKeyDown`, lines ~90-106)
- Test: manual (component keystroke behavior; verified in Task 11 run-through)

- [ ] **Step 1: Implement**

In `src/components/GridCell.tsx`, add the import near the top:

```ts
import { executeCommand } from "@/lib/commands/commands";
```

Replace the textarea `onKeyDown` handler body with:

```tsx
        onKeyDown={(e) => {
          // Single-line cells: never insert a literal newline.
          // Backspace on an empty cell deletes the node (and reselects a neighbor).
          if (e.key === "Backspace" && node.text === "") {
            e.preventDefault();
            executeCommand("node.delete");
            return;
          }
          // Plain Enter / Shift+Enter are handled by the global keymap layer
          // (node.addAnswer / node.answerAcross). Do not intercept them here.
        }}
```

- [ ] **Step 2: Verify it compiles / lint**

Run: `npx tsc --noEmit` (expect no NEW errors beyond the recorded baseline) and `npm test`
Expected: existing suite still green vs baseline.

- [ ] **Step 3: Commit**

```bash
git add src/components/GridCell.tsx
git commit -m "feat(editor): single-line cells; Backspace-on-empty deletes"
```

### Task 8: Default keymap — conceded/extended bindings

The default keymap lacks status bindings (only vim has them). Add them so a non-vim user can mark conceded/extended. Matches the spec keymap (`Ctrl+Shift+X` conceded, `Ctrl+E` extended).

**Files:**
- Modify: `src/lib/keymap/presets.ts` (`DEFAULT_KEYMAP.bindings.normal`)
- Test: `src/lib/keymap/presets.test.ts` if present, else add `src/lib/keymap/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Create/add `src/lib/keymap/presets.test.ts`:

```ts
import { DEFAULT_KEYMAP } from "@/lib/keymap/presets";

it("default keymap binds conceded and extended", () => {
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+Shift+x"]).toBe("status.toggleConceded");
  expect(DEFAULT_KEYMAP.bindings.normal["Ctrl+e"]).toBe("status.toggleExtended");
});
```

> Confirm the canonical chord casing by checking an existing default binding (e.g. `Ctrl+Shift+z` is present, so `Ctrl+Shift+x` is the right shape; `Ctrl+b` lowercase confirms `Ctrl+e`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/keymap/presets.test.ts`
Expected: FAIL — bindings undefined.

- [ ] **Step 3: Implement**

In `src/lib/keymap/presets.ts`, add to `DEFAULT_KEYMAP.bindings.normal` (just below `"Alt+Enter": "arg.newRoot",`):

```ts
      "Ctrl+Shift+x": "status.toggleConceded",
      "Ctrl+e": "status.toggleExtended",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/keymap/presets.test.ts`
Expected: PASS. Then `npm test` — if the 4 known-stale keymap tests are the only reds, that matches baseline.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keymap/presets.ts src/lib/keymap/presets.test.ts
git commit -m "feat(editor): default keymap bindings for conceded/extended"
```

### Task 9: Column header "+" adds a root in that column

**Files:**
- Modify: `src/components/FlowGrid.tsx` (the speech-name `<th>` row, lines ~116-122)
- Test: manual (verified in Task 11)

- [ ] **Step 1: Implement**

In `src/components/FlowGrid.tsx`, add near the other store hooks:

```ts
  const addNode = useRoundStore((s) => s.addNode);
  const setMode = useRoundStore((s) => s.setMode);
```

Replace the speech-name header row (`<tr>{speeches.map(...)}</tr>`, the second one in `<thead>`) with:

```tsx
        <tr>
          {speeches.map((speech) => (
            <th key={speech.id} className={speech.side === "aff" ? "side-aff" : "side-neg"}>
              <span className="th-label">{speech.name}</span>
              {!isCx && (
                <button
                  type="button"
                  className="th-add"
                  title={`New argument in ${speech.name}`}
                  onClick={() => {
                    const id = addNode({ sheetId, speechId: speech.id, parentId: null });
                    setSelection({ sheetId, speechId: speech.id, nodeId: id });
                    setMode("insert");
                  }}
                >
                  +
                </button>
              )}
            </th>
          ))}
        </tr>
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/FlowGrid.tsx
git commit -m "feat(editor): column header + button to add a root in any column"
```

---

## Phase 5 — Visual refresh (Excel-tight)

### Task 10: Excel-tight grid CSS

The `.flow` table is already a collapsed-border grid. Tighten it to read like Excel: uniform fixed columns, continuous thin gridlines, a clean focus ring, and a small unobtrusive header "+". Side color stays text + thin left edge (no full-cell tints — matches the approved `refresh-2.html`).

**Files:**
- Modify: `src/app/globals.css` (section 4 "FLOW GRID", lines ~117-257)
- Verify: manual against `.superpowers/brainstorm/47912-1780644473/content/refresh-2.html`

- [ ] **Step 1: Implement the CSS changes**

In `src/app/globals.css`, update/extend the flow rules:

```css
.flow {
  border-collapse: collapse;
  font-size: 12.5px;
  width: 100%;
  table-layout: fixed; /* uniform Excel-like columns */
  font-family: var(--font-sans);
}

.flow th {
  position: relative;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  white-space: nowrap;
  font-family: var(--font-mono);
}

.th-add {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s;
  line-height: 1;
  padding: 2px 4px;
}
.flow th:hover .th-add { opacity: 0.7; }
.th-add:hover { opacity: 1 !important; }

.flow td {
  vertical-align: top;
  padding: 5px 8px;
  border: 1px solid var(--line);
  line-height: 1.35;
  background: transparent;
  color: var(--ink);
}
```

Keep the existing `.side-aff`/`.side-neg`, `.cell-sel`, `.arg-*`, `.cell-input`, `.cell-empty`, `.cell-drop` rules. **Reconsider `.cell-void`:** for an Excel-tight grid the gridlines should be continuous, so change it to keep a faint border rather than removing it:

```css
.flow td.cell-void {
  border-color: var(--line);
}
```

- [ ] **Step 2: Manual verification (run the app)**

Use the **run** skill (or `npm run dev`) to open the app, create/open a flow with a couple of roots (one started via a later column's header "+"), responses across columns, a conceded cell, and an extended cell. Confirm against `refresh-2.html`:
- cells share continuous gridlines, no horizontal gaps;
- ↑/↓ move physically between cells across bands; ←/→ go to parent/first-child;
- typing edits immediately (modeless); Enter adds a sibling; Shift+Enter responds in the next column;
- a root created from a non-first column's "+" sits in that column;
- conceded shows line-through; extended shows `↳` inside the cell.

Capture a screenshot for the record.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(editor): Excel-tight flow grid visual refresh"
```

### Task 11: Full regression + lint pass

- [ ] **Step 1: Run the whole suite and lint**

Run: `npm test` then `npm run lint` then `npx tsc --noEmit`
Expected: no NEW failures vs the baseline recorded at the start (the 4 known-stale keymap tests + 6 known tsc errors may remain — do not let this task's changes add to them).

- [ ] **Step 2: Update the build-progress note** (optional, if practice in this repo)

- [ ] **Step 3: Final commit if anything changed**

```bash
git add -A && git commit -m "chore(editor): regression + lint pass for ashwagandhae-feel port"
```

---

## Self-review notes (covered)

- **Roots-anywhere:** Task 1 (sheet-wide order) + Task 4 (layout sorts by order) + Task 9 (header "+") + existing `arg.newRoot` (Alt+Enter) key.
- **Physical arrow nav:** Task 5 + Task 6 (↑/↓); ←/→ keep `parentOf`/`firstChildOf` (already physical-left=parent, physical-right=child by the column=depth invariant).
- **Modeless single-line editing:** default keymap already modeless; Task 2/3 enforce single-line; Task 7 removes in-cell newline.
- **Everything-is-a-cell extension:** reuses existing `'extended'` status (↳ rendered inside the cell by `GridCell`); Task 8 makes it reachable in the default keymap.
- **Excel-tight visual:** Task 10.
- **Export untouched:** `buildLayout`'s output shape is unchanged (only root ordering), so `src/lib/export/cells.ts` and PrintView need no changes — verified by their tests staying green in Task 11.
