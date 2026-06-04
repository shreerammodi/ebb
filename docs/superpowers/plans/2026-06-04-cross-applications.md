# Cross-Applications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a debater record that one argument **also applies** to another argument — a sideways reference (`from → to`, optionally cross-sheet) shown as a small chip on the source cell that navigates to the target when clicked. Pure annotation: it never changes the tree or layout.

**Architecture:** A round-level `links: CrossApp[]` collection (`{ id, fromId, toId, label? }`) so a link can span sheets (apply a DA to the case). Pure ops in `model/links.ts`; undoable store actions; a transient `pendingLinkFromId` "link mode" — start on the source, then the next cell click completes the link; a chip rendered in `GridCell` that navigates (cross-sheet aware) to the target. `buildLayout` is untouched.

**Tech Stack:** Next.js + React, Zustand, TypeScript, Vitest + Testing Library, Dexie. Blue = Aff, red = Neg, light mode.

**Prerequisite:** Plan `2026-06-04-cell-display-editing-overhaul.md` is merged. Independent of the Groups plan; if both touch `normalize.ts` / `createRound` / `db.ts`, keep each addition on its own line and bump the Dexie version to the next free number.

**Baseline:** Run `npm test -- --run` first and record the green count; keep it green each task.

---

### Task 1: `CrossApp` model + pure ops

**Files:**
- Modify: `src/lib/model/types.ts` (add `CrossApp`; add `links` to `Round`)
- Create: `src/lib/model/links.ts` + `src/lib/model/links.test.ts`
- Modify: `src/lib/model/normalize.ts` (default `links: []`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/model/links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { linksFrom, addLink, removeLink, removeLinksForNode, setLinkLabel } from "@/lib/model/links";
import type { CrossApp } from "@/lib/model/types";

describe("cross-app link ops (pure)", () => {
  it("addLink appends a link with the given endpoints", () => {
    const ls = addLink([], { fromId: "a", toId: "b", label: "turns case" });
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ fromId: "a", toId: "b", label: "turns case" });
    expect(typeof ls[0].id).toBe("string");
  });

  it("addLink ignores self-links and exact duplicates", () => {
    expect(addLink([], { fromId: "a", toId: "a" })).toEqual([]);
    const ls = addLink([], { fromId: "a", toId: "b" });
    expect(addLink(ls, { fromId: "a", toId: "b" })).toHaveLength(1);
  });

  it("linksFrom returns links whose source is the node", () => {
    const ls = addLink(addLink([], { fromId: "a", toId: "b" }), { fromId: "c", toId: "b" });
    expect(linksFrom(ls, "a")).toHaveLength(1);
  });

  it("removeLink drops by id; removeLinksForNode drops any link touching a node", () => {
    const ls = addLink([], { fromId: "a", toId: "b" });
    expect(removeLink(ls, ls[0].id)).toEqual([]);
    expect(removeLinksForNode(ls, "b")).toEqual([]);
    expect(removeLinksForNode(ls, "a")).toEqual([]);
  });

  it("setLinkLabel updates only the matching link", () => {
    const ls = addLink([], { fromId: "a", toId: "b" });
    expect(setLinkLabel(ls, ls[0].id, "x")[0].label).toBe("x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/model/links.test.ts`
Expected: FAIL — module/types do not exist.

- [ ] **Step 3: Implement**

In `src/lib/model/types.ts`, add the type (near `ArgumentNode`):

```ts
/** A cross-application: source argument also applies to a target argument. */
export interface CrossApp {
  id: string;
  /** Source node id (chip is shown here). */
  fromId: string;
  /** Target node id (may live on another sheet). */
  toId: string;
  label?: string;
}
```

Add to `Round` (after `nodes: ArgumentNode[];`):

```ts
  /** Cross-application links (sideways references). */
  links: CrossApp[];
```

Create `src/lib/model/links.ts`:

```ts
import type { CrossApp } from "@/lib/model/types";
import { uid } from "@/lib/model/ids";

export function linksFrom(links: CrossApp[], nodeId: string): CrossApp[] {
  return links.filter((l) => l.fromId === nodeId);
}

export function addLink(
  links: CrossApp[],
  input: { fromId: string; toId: string; label?: string },
): CrossApp[] {
  if (input.fromId === input.toId) return links;
  if (links.some((l) => l.fromId === input.fromId && l.toId === input.toId)) return links;
  return [...links, { id: uid("xapp"), fromId: input.fromId, toId: input.toId, label: input.label }];
}

export function removeLink(links: CrossApp[], id: string): CrossApp[] {
  return links.filter((l) => l.id !== id);
}

/** Drops every link with this node at either end (use when a node is deleted). */
export function removeLinksForNode(links: CrossApp[], nodeId: string): CrossApp[] {
  return links.filter((l) => l.fromId !== nodeId && l.toId !== nodeId);
}

export function setLinkLabel(links: CrossApp[], id: string, label: string): CrossApp[] {
  return links.map((l) => (l.id === id ? { ...l, label } : l));
}
```

In `src/lib/model/normalize.ts`, default the collection inside `normalizeRound`:

```ts
  if (!Array.isArray(r.links)) r.links = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/model/links.test.ts`
Expected: PASS.

- [ ] **Step 5: Initialize `links` in `createRound`**

In `src/lib/store/useRoundStore.ts` `createRound`, add to the `round` literal (after `nodes: [],`):

```ts
      links: [],
```

Run: `npm test -- --run` — add `links: []` to any `Round` literal in tests that now fails to typecheck. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/model/types.ts src/lib/model/links.ts src/lib/model/links.test.ts src/lib/model/normalize.ts src/lib/store/useRoundStore.ts
git commit -m "feat(model): CrossApp type + pure link ops + links collection"
```

---

### Task 2: Store actions + clean up links on node delete

**Files:**
- Modify: `src/lib/store/useRoundStore.ts`
- Test: `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/store/useRoundStore.test.ts`:

```ts
it("addCrossApp adds a link and removeNode cleans up links touching the node", () => {
  // create round + sheet; add nodes a,b (roots)
  useRoundStore.getState().addCrossApp(a, b, "turns case");
  expect(useRoundStore.getState().round!.links).toHaveLength(1);
  useRoundStore.getState().removeNode(b);
  expect(useRoundStore.getState().round!.links).toHaveLength(0);
});

it("addCrossApp is undoable", () => {
  useRoundStore.getState().addCrossApp(a, b);
  useRoundStore.getState().undo();
  expect(useRoundStore.getState().round!.links).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/store/useRoundStore.test.ts`
Expected: FAIL — `addCrossApp` not a function; links survive node delete.

- [ ] **Step 3: Implement**

In `src/lib/store/useRoundStore.ts`, import:

```ts
import { addLink, removeLink, removeLinksForNode, setLinkLabel as setLinkLabelOp } from "@/lib/model/links";
```

Add to `RoundActions`:

```ts
  addCrossApp(fromId: string, toId: string, label?: string): void;
  removeCrossApp(id: string): void;
  setCrossAppLabel(id: string, label: string): void;
```

Add implementations:

```ts
  // ── Cross-applications ──────────────────────────────────────────────────────
  addCrossApp(fromId, toId, label) {
    if (!get().round) return;
    get()._commit(null, (r) => ({ ...r, links: addLink(r.links, { fromId, toId, label }) }));
  },
  removeCrossApp(id) {
    if (!get().round) return;
    get()._commit(null, (r) => ({ ...r, links: removeLink(r.links, id) }));
  },
  setCrossAppLabel(id, label) {
    if (!get().round) return;
    get()._commit(`xapplabel:${id}`, (r) => ({ ...r, links: setLinkLabelOp(r.links, id, label) }));
  },
```

Update the existing `removeNode` action to also drop links touching the node — replace its `_commit` line:

```ts
  removeNode(nodeId) {
    const { round, selection } = get();
    if (!round) return;
    get()._commit(null, (r) => ({
      ...r,
      nodes: treeRemoveNode(r.nodes, nodeId),
      links: removeLinksForNode(r.links, nodeId),
    }));
    if (selection?.nodeId === nodeId) set({ selection: null });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/store/useRoundStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): cross-app actions; prune links on node delete"
```

---

### Task 3: Link-mode (start on source, complete on next cell click)

A transient `pendingLinkFromId` in the store. A command starts it on the selected node; clicking any cell while pending creates the link and clears the mode.

**Files:**
- Modify: `src/lib/store/useRoundStore.ts` (state + setter)
- Modify: `src/lib/commands/registry.ts`, `src/lib/commands/commands.ts`, `src/lib/keymap/presets.ts`
- Test: `src/lib/commands/commands.test.ts`, `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/commands/commands.test.ts`:

```ts
it("xapp.start sets pendingLinkFromId to the selected node", () => {
  // select node a
  executeCommand("xapp.start");
  expect(useRoundStore.getState().pendingLinkFromId).toBe(a);
});

it("xapp.cancel clears pending link mode", () => {
  executeCommand("xapp.start");
  executeCommand("xapp.cancel");
  expect(useRoundStore.getState().pendingLinkFromId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/commands/commands.test.ts`
Expected: FAIL — `pendingLinkFromId` / commands missing.

- [ ] **Step 3: Implement state, setter, commands, binding**

In `src/lib/store/useRoundStore.ts`:

Add to `RoundState`:

```ts
  /** When set, the next cell click completes a cross-app link from this node. */
  pendingLinkFromId: string | null;
```

Initialize it in the initial state and in `createRound`'s `set({...})` (both default `null`):

```ts
  pendingLinkFromId: null,
```

Add to `RoundActions` + implement:

```ts
  setPendingLinkFrom(nodeId: string | null): void;
```
```ts
  setPendingLinkFrom(nodeId) {
    set({ pendingLinkFromId: nodeId });
  },
```

In `src/lib/commands/registry.ts`, add ids + labels:

```ts
  | "xapp.start"
  | "xapp.cancel"
```
```ts
  "xapp.start": { id: "xapp.start", label: "Cross-apply from this argument" },
  "xapp.cancel": { id: "xapp.cancel", label: "Cancel cross-apply" },
```

In `src/lib/commands/commands.ts`, add cases:

```ts
    // ── Cross-applications ──────────────────────────────────────────────────────
    case "xapp.start": {
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      state.setPendingLinkFrom(sel.nodeId);
      return;
    }
    case "xapp.cancel": {
      state.setPendingLinkFrom(null);
      return;
    }
```

In `src/lib/keymap/presets.ts`, add to `DEFAULT_KEYMAP.normal` and `VIM_KEYMAP.normal`:

```ts
      "Ctrl+l": "xapp.start",
      Escape: "xapp.cancel",
```

(Vim already has `Escape: "edit.exit"` in *insert* mode; this `Escape` is in *normal* mode, so there's no collision.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/commands/commands.test.ts src/lib/store/useRoundStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/commands/registry.ts src/lib/commands/commands.ts src/lib/keymap/presets.ts src/lib/commands/commands.test.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(commands): cross-app link mode (xapp.start / xapp.cancel)"
```

---

### Task 4: Complete the link on cell click; render + navigate the chip

`GridCell`'s click completes a pending link instead of selecting; the source cell shows a chip that navigates (cross-sheet) to the target.

**Files:**
- Modify: `src/components/GridCell.tsx`
- Modify: `src/components/FlowGrid.tsx` (pass links to cells)
- Modify: `src/app/globals.css`
- Test: `src/components/GridCell.test.tsx`, `src/components/FlowGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/FlowGrid.test.tsx`:

```ts
it("clicking a cell while link-mode is pending creates a cross-app to it", () => {
  // nodes a,b; start link from a
  useRoundStore.getState().setPendingLinkFrom(a);
  render(/* FlowGrid */);
  fireEvent.click(screen.getByText("B-text"));
  const links = useRoundStore.getState().round!.links;
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({ fromId: a, toId: b });
  expect(useRoundStore.getState().pendingLinkFromId).toBeNull(); // mode cleared
});

it("renders a cross-app chip on the source cell", () => {
  useRoundStore.getState().addCrossApp(a, b, "turns case");
  render(/* FlowGrid */);
  expect(screen.getByText(/turns case/)).toHaveClass("xapp-chip");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/FlowGrid.test.tsx`
Expected: FAIL — click selects instead of linking; no chip.

- [ ] **Step 3: Pass links into GridCell**

In `src/components/FlowGrid.tsx`, subscribe to links and pass each cell its outgoing links:

```tsx
const links = useRoundStore((s) => s.round?.links ?? []);
```

Build a lookup before rendering rows:

```tsx
const linksByFrom = new Map<string, typeof links>();
for (const l of links) {
  const arr = linksByFrom.get(l.fromId) ?? [];
  arr.push(l);
  linksByFrom.set(l.fromId, arr);
}
```

Pass to the node-cell `<GridCell>`:

```tsx
                      outLinks={linksByFrom.get(node.id) ?? []}
```

- [ ] **Step 4: Complete-on-click + chip in GridCell**

In `src/components/GridCell.tsx`, extend props:

```tsx
import type { CrossApp } from "@/lib/model/types";
// ...
  outLinks?: CrossApp[];
```

Read the needed store bits:

```tsx
  const pendingLinkFromId = useRoundStore((s) => s.pendingLinkFromId);
  const setPendingLinkFrom = useRoundStore((s) => s.setPendingLinkFrom);
  const addCrossApp = useRoundStore((s) => s.addCrossApp);
  const setActiveSheet = useRoundStore((s) => s.setActiveSheet);
  const allNodes = useRoundStore((s) => s.round?.nodes ?? []);
```

Replace `handleClick` so it completes a pending link when one is active:

```tsx
  const handleClick = () => {
    if (pendingLinkFromId && pendingLinkFromId !== node.id) {
      addCrossApp(pendingLinkFromId, node.id);
      setPendingLinkFrom(null);
      return;
    }
    setSelection({ sheetId, speechId, nodeId: node.id });
  };
```

Render chips inside the display `<span>`, after the text (navigates cross-sheet to the target):

```tsx
      {!isCx &&
        (outLinks ?? []).map((l) => {
          const target = allNodes.find((n) => n.id === l.toId);
          return (
            <span
              key={l.id}
              className="xapp-chip"
              title="Go to cross-applied argument"
              onClick={(e) => {
                e.stopPropagation();
                if (!target) return;
                setActiveSheet(target.sheetId);
                setSelection({
                  sheetId: target.sheetId,
                  speechId: target.speechId,
                  nodeId: target.id,
                });
              }}
            >
              ↗ {l.label || (target ? target.text.slice(0, 18) : "x-app")}
            </span>
          );
        })}
```

In `src/app/globals.css`, add:

```css
.xapp-chip {
  display: inline-block;
  margin-left: 5px;
  padding: 0 5px;
  font-size: 9px;
  font-weight: 600;
  color: #6d28d9;
  background: #f3eefe;
  border: 1px solid #e5d9fb;
  border-radius: 3px;
  cursor: pointer;
  vertical-align: middle;
}
```

- [ ] **Step 5: Run test + manual check**

Run: `npm test -- --run src/components/FlowGrid.test.tsx src/components/GridCell.test.tsx`
Expected: PASS. Then `npm run dev`: select an arg, `Ctrl+l`, click another arg (any sheet) → a `↗` chip appears on the source; clicking it jumps to the target. `Esc` cancels link mode. Confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/GridCell.tsx src/components/FlowGrid.tsx src/app/globals.css src/components/GridCell.test.tsx src/components/FlowGrid.test.tsx
git commit -m "feat(grid): complete cross-app on click; navigable chip on source cell"
```

---

### Task 5: Pending-link affordance (optional polish) + persistence

Show that link mode is armed, and persist `links` across the Dexie bump.

**Files:**
- Modify: `src/components/FlowGrid.tsx` or a small banner (affordance)
- Modify: `src/lib/persistence/db.ts`
- Test: `src/lib/persistence/io.test.ts`

- [ ] **Step 1: Write the failing persistence test**

Add to `src/lib/persistence/io.test.ts`:

```ts
it("round-trips links and defaults them for legacy files", () => {
  const round = /* round with one CrossApp (reuse helpers) */;
  expect(importRoundJSON(exportRoundJSON(round)).links).toHaveLength(1);
  const legacy = /* round JSON omitting links */;
  expect(importRoundJSON(JSON.stringify({ version: 1, round: legacy })).links).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails (or guards normalize)**

Run: `npm test -- --run src/lib/persistence/io.test.ts`
Expected: legacy-default case FAILS if normalize wasn't updated in Task 1; otherwise PASS (keep as regression guard).

- [ ] **Step 3: Add the Dexie version bump**

In `src/lib/persistence/db.ts`, after the highest existing `this.version(N)...` block (use the next free number — v4 if Groups isn't merged, v5 if it is):

```ts
    this.version(5).upgrade((tx) =>
      tx
        .table("rounds")
        .toCollection()
        .modify((r: { links?: unknown }) => {
          if (!Array.isArray(r.links)) r.links = [];
        }),
    );
```

(If the Groups plan is NOT merged, change `5` to `4`. Versions must be contiguous and increasing.)

- [ ] **Step 4: Affordance — dim the grid / show a hint while armed**

In `src/components/FlowGrid.tsx`, read `pendingLinkFromId` and render a small fixed hint when set (above the `<table className="flow">`):

```tsx
const pendingLinkFromId = useRoundStore((s) => s.pendingLinkFromId);
```
```tsx
      {pendingLinkFromId && (
        <div className="xapp-hint">Cross-apply: click the target argument · Esc to cancel</div>
      )}
```

In `src/app/globals.css`:

```css
.xapp-hint {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #6d28d9;
  background: #f3eefe;
  border-bottom: 1px solid #e5d9fb;
}
```

- [ ] **Step 5: Run tests + manual check**

Run: `npm test -- --run src/lib/persistence/`
Expected: PASS. `npm run dev`: arming link mode shows the hint; export → import preserves links. Confirm.

- [ ] **Step 6: Commit**

```bash
git add src/lib/persistence/db.ts src/lib/persistence/io.test.ts src/components/FlowGrid.tsx src/app/globals.css
git commit -m "feat(xapp): pending-link hint; Dexie defaults links on existing rounds"
```

---

## Self-Review

**Spec coverage:** sideways reference `from → to` → Tasks 1–4; chip that records "also applies there" and navigates (cross-sheet) → Task 4; stored in a separate `links` collection, never a parent edge, never affects layout → Task 1 (round-level, `buildLayout` untouched); creation flow → Task 3; persistence → Tasks 1,5. ✓ Link pruned when an endpoint node is deleted → Task 2 (prevents dangling chips). ✓

**Type consistency:** pure ops `linksFrom/addLink/removeLink/removeLinksForNode/setLinkLabel` (model) → store actions `addCrossApp/removeCrossApp/setCrossAppLabel` + `setPendingLinkFrom` → commands `xapp.start/xapp.cancel`. `CrossApp { id, fromId, toId, label? }` used identically across model, store, FlowGrid map, GridCell props. `setLinkLabel` aliased `setLinkLabelOp` in the store to avoid colliding with the `setCrossAppLabel` action. `pendingLinkFromId` typed `string | null` in state, setter, command, and GridCell read.

**Placeholder scan:** "reuse helpers" comments point at existing test bootstrap; all shipped code is complete. The only conditional instruction is the Dexie version number (depends on whether Groups is merged) — explicitly explained. No TBD/TODO.
