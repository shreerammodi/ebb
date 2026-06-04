# Cell Display & Editing Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul how flow cells display and how editing feels — line-through/bold/extension-arrow decorations, the `Enter`/`Shift+Enter` create flow, free-placement typing, drag-to-move, and per-sheet columns — by extending the live `ArgumentNode` model, and delete the dead box-tree engine.

**Architecture:** The live model already is the column-free band tree (`ArgumentNode` has `speechId`=column, `parentId`=alignment, `order`; `buildLayout` already does band rowspans; the store has coalesced snapshot undo/redo). We extend it: add a `bold` field, overhaul `GridCell`'s rendering, wire the already-bound `Enter`→`node.addAnswer` / `Shift+Enter`→`node.answerAcross` through the cell editor, add free-placement and drag-to-move, and give each sheet a `startSpeechId` so neg sheets begin at 1NC. Persistence is additive (Dexie upgrade defaulting `bold`).

**Tech Stack:** Next.js + React, Zustand, TypeScript, Vitest + Testing Library, Dexie. Reserved colors: blue = Aff, red = Neg. Light mode only.

**Scope note:** This is Plan 1 of 3 from `docs/superpowers/specs/2026-06-04-flow-cell-model-design.md`. Groups (Plan 2) and cross-applications (Plan 3) are separate, additive plans.

**Baseline:** Before starting, run `npm test -- --run` and record the passing count; every task keeps it green. Pre-existing stale tests called out in build-progress memory (4 keymap tests, some tsc errors) are NOT introduced by this plan — do not fix them here.

---

### Task 1: Add `bold` to the model

**Files:**
- Modify: `src/lib/model/types.ts:30-44` (ArgumentNode)
- Modify: `src/lib/model/tree.ts:43-82` (addNode), add `toggleBold`
- Modify: `src/lib/model/normalize.ts:22-32` (default bold on load)
- Test: `src/lib/model/tree.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/model/tree.test.ts`:

```ts
import { addNode, toggleBold } from "@/lib/model/tree";

describe("bold", () => {
  it("addNode defaults bold to false", () => {
    const { node } = addNode([], { sheetId: "s1", speechId: "1ac", parentId: null });
    expect(node.bold).toBe(false);
  });

  it("toggleBold flips bold and is pure", () => {
    const { nodes, node } = addNode([], { sheetId: "s1", speechId: "1ac", parentId: null });
    const on = toggleBold(nodes, node.id);
    expect(on.find((n) => n.id === node.id)!.bold).toBe(true);
    expect(nodes.find((n) => n.id === node.id)!.bold).toBe(false); // input untouched
    const off = toggleBold(on, node.id);
    expect(off.find((n) => n.id === node.id)!.bold).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/model/tree.test.ts`
Expected: FAIL — `toggleBold` is not exported / `node.bold` is `undefined`.

- [ ] **Step 3: Add the field and helper**

In `src/lib/model/types.ts`, add to `ArgumentNode` (after `statuses`):

```ts
  statuses: NodeStatus[];
  /** Emphasis decoration (renders bold). */
  bold: boolean;
  /** Override the auto-generated display number for this node. */
  numberOverride?: number | null;
```

In `src/lib/model/tree.ts`, set `bold` in the `addNode` node literal (after `statuses: []`):

```ts
    text: input.text ?? "",
    statuses: [],
    bold: false,
    numberOverride: null,
```

And append to `src/lib/model/tree.ts`:

```ts
/**
 * Toggles the bold decoration on the target node.
 */
export function toggleBold(nodes: ArgumentNode[], nodeId: string): ArgumentNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, bold: !n.bold } : n));
}
```

In `src/lib/model/normalize.ts`, default `bold` on loaded nodes — after the `r.sheets` line in `normalizeRound`:

```ts
  r.sheets = r.sheets.map((s) => ({ ...s, kind: s.kind ?? "flow" }));
  if (Array.isArray(r.nodes)) {
    r.nodes = r.nodes.map((n) => ({ ...n, bold: n.bold ?? false }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/model/tree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model/types.ts src/lib/model/tree.ts src/lib/model/normalize.ts src/lib/model/tree.test.ts
git commit -m "feat(model): add bold decoration field to ArgumentNode"
```

---

### Task 2: Store action `toggleNodeBold`

**Files:**
- Modify: `src/lib/store/useRoundStore.ts` (import, interface, action)
- Test: `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/store/useRoundStore.test.ts` (follow the file's existing setup pattern for creating a round + node; mirror an existing `toggleNodeStatus` test):

```ts
it("toggleNodeBold flips bold and is undoable", () => {
  const s = useRoundStore.getState();
  s.createRound({ role: "aff", format: testFormat, meta: {} });
  const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
  const id = useRoundStore.getState().addNode({ sheetId, speechId: "1nc", parentId: null });
  useRoundStore.getState().toggleNodeBold(id);
  expect(useRoundStore.getState().round!.nodes.find((n) => n.id === id)!.bold).toBe(true);
  useRoundStore.getState().undo();
  expect(useRoundStore.getState().round!.nodes.find((n) => n.id === id)!.bold).toBe(false);
});
```

(If `testFormat` / round bootstrap helpers differ in this file, reuse whatever the neighboring tests use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/store/useRoundStore.test.ts`
Expected: FAIL — `toggleNodeBold` is not a function.

- [ ] **Step 3: Implement the action**

In `src/lib/store/useRoundStore.ts`:

Add `toggleBold` to the tree import block (alongside `toggleStatus`):

```ts
import {
  addNode as treeAddNode,
  updateText,
  toggleStatus,
  toggleBold,
  setParent,
  removeNode as treeRemoveNode,
  moveNode as treeMoveNode,
} from "@/lib/model/tree";
```

Add to the `RoundActions` interface (after `toggleNodeStatus`):

```ts
  toggleNodeBold(nodeId: string): void;
```

Add the implementation (after the `toggleNodeStatus` action):

```ts
  // ── toggleNodeBold ─────────────────────────────────────────────────────────
  toggleNodeBold(nodeId) {
    if (!get().round) return;
    get()._commit(null, (r) => ({ ...r, nodes: toggleBold(r.nodes, nodeId) }));
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/store/useRoundStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): toggleNodeBold action"
```

---

### Task 3: `format.toggleBold` command + keymap binding

**Files:**
- Modify: `src/lib/commands/registry.ts` (CommandId union + COMMANDS map)
- Modify: `src/lib/commands/commands.ts` (handler)
- Modify: `src/lib/keymap/presets.ts` (binding)
- Test: `src/lib/commands/commands.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/commands/commands.test.ts` (mirror an existing `status.toggleConceded` test's setup):

```ts
it("format.toggleBold toggles bold on the selected node", () => {
  // ...create round + neg sheet + node, select it (reuse the file's helpers)...
  executeCommand("format.toggleBold");
  const node = useRoundStore.getState().round!.nodes.find((n) => n.id === nodeId)!;
  expect(node.bold).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/commands/commands.test.ts`
Expected: FAIL — `"format.toggleBold"` is not assignable to `CommandId`.

- [ ] **Step 3: Add command id, handler, binding**

In `src/lib/commands/registry.ts`, add to the `CommandId` union (after `"status.toggleExtended"`):

```ts
  | "status.toggleExtended"
  | "format.toggleBold"
```

And to the `COMMANDS` map:

```ts
  "format.toggleBold": { id: "format.toggleBold", label: "Toggle bold" },
```

In `src/lib/commands/commands.ts`, extend the status case block to also handle bold — replace the `status.toggleConceded`/`status.toggleExtended` case with:

```ts
    // ── Status / format ────────────────────────────────────────────────────────
    case "status.toggleConceded":
    case "status.toggleExtended":
    case "format.toggleBold": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      if (isCxSheet(round, sel.sheetId)) return;
      if (id === "format.toggleBold") {
        state.toggleNodeBold(sel.nodeId);
      } else {
        state.toggleNodeStatus(sel.nodeId, id === "status.toggleConceded" ? "conceded" : "extended");
      }
      return;
    }
```

In `src/lib/keymap/presets.ts`, add to `COMMON_NORMAL` (shared by both presets):

```ts
  "Ctrl+b": "format.toggleBold",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/commands/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/registry.ts src/lib/commands/commands.ts src/lib/keymap/presets.ts src/lib/commands/commands.test.ts
git commit -m "feat(commands): format.toggleBold command + Ctrl+b binding"
```

---

### Task 4: Decoration display overhaul in `GridCell`

Replace the "✓ conceded" / "✓ extended" text badges with paper-flow decorations: line-through for conceded, **bold** for bold, a `↳` extension arrow for extended. Drop badge stays.

**Files:**
- Modify: `src/components/GridCell.tsx:74-125`
- Modify: `src/app/globals.css` (after `.status-good` block ~line 206)
- Test: `src/components/GridCell.test.tsx` (if absent, create it)

- [ ] **Step 1: Write the failing test**

In `src/components/GridCell.test.tsx`, add tests (reuse the file's existing render helper if present; otherwise render `<GridCell .../>` with a store-backed node):

```ts
it("renders conceded text with line-through, not a badge", () => {
  // node with statuses: ["conceded"], text "no link"
  render(/* GridCell for that node, not selected */);
  const text = screen.getByText("no link");
  expect(text).toHaveClass("arg-crossed");
  expect(screen.queryByText(/conceded/i)).toBeNull();
});

it("renders bold text in a .arg-bold span", () => {
  // node with bold: true, text "outweighs"
  render(/* ... */);
  expect(screen.getByText("outweighs")).toHaveClass("arg-bold");
});

it("renders an extension arrow when extended", () => {
  // node with statuses: ["extended"]
  render(/* ... */);
  expect(screen.getByText("↳")).toBeInTheDocument();
  expect(screen.queryByText(/extended/i)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/GridCell.test.tsx`
Expected: FAIL — no `arg-crossed`/`arg-bold` class; badge text still present.

- [ ] **Step 3: Rewrite the display branch**

In `src/components/GridCell.tsx`, replace the non-insert `return (...)` block (currently lines ~102-125) with:

```tsx
  const classes = [
    node.statuses.includes("conceded") ? "arg-crossed" : "",
    node.bold ? "arg-bold" : "",
    hasChildren ? "arg-parent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span onClick={handleClick} style={{ display: "block", width: "100%", cursor: "pointer" }}>
      {!isCx && autoNumber && num !== null && <span className="arg-num">{num}.</span>}
      {!isCx && showExtended && <span className="arg-ext">↳</span>}
      <span className={classes || undefined}>{node.text}</span>
      {!isCx && labelDrops && isDropped && (
        <>
          {" "}
          <span className="badge-drop">⚠ dropped</span>
        </>
      )}
    </span>
  );
```

(`showConceded`/`showExtended` consts above stay; `showConceded` is now folded into `classes`, so delete the now-unused `showConceded` const to avoid a lint error.)

In `src/app/globals.css`, after the `.status-good { ... }` block add:

```css
.arg-crossed {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  opacity: 0.6;
}

.arg-bold {
  font-weight: 700;
}

.arg-ext {
  margin-right: 3px;
  font-weight: 700;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/GridCell.test.tsx`
Expected: PASS. Also run `npm test -- --run` to confirm no other GridCell snapshot/text assertions broke; update any that asserted the old badge text.

- [ ] **Step 5: Commit**

```bash
git add src/components/GridCell.tsx src/app/globals.css src/components/GridCell.test.tsx
git commit -m "feat(grid): line-through / bold / extension-arrow cell decorations"
```

---

### Task 5: Let `Enter` / `Shift+Enter` drive creation from inside a cell

Today `GridCell`'s textarea `onKeyDown` swallows `Enter` to exit insert mode, fighting the keymap's `Enter → node.addAnswer` / `Shift+Enter → node.answerAcross`. Remove that, and give in-cell line breaks (tag ⏎ cite) a dedicated chord (`Ctrl+Enter`).

> **Micro-decision (revisitable):** `Ctrl+Enter` = newline inside a cell, since `Enter` and `Shift+Enter` are taken by create/respond. Remappable later.

**Files:**
- Modify: `src/components/GridCell.tsx:78-100` (textarea `onKeyDown`)
- Test: `src/components/GridCell.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/GridCell.test.tsx`:

```ts
it("Ctrl+Enter inserts a newline in the focused cell instead of creating a sibling", () => {
  // render a selected (editable) GridCell for a node with text "tag"
  const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
  ta.focus();
  ta.setSelectionRange(3, 3);
  fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
  // store text now contains a newline
  expect(useRoundStore.getState().round!.nodes.find((n) => n.id === nodeId)!.text).toContain("\n");
});

it("plain Enter does NOT preventDefault inside the cell (keymap handles it)", () => {
  const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
  const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  ta.dispatchEvent(ev);
  // GridCell's own handler must not consume plain Enter anymore
  expect(ev.defaultPrevented).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/GridCell.test.tsx`
Expected: FAIL — current handler calls `preventDefault()` on plain Enter and has no Ctrl+Enter newline path.

- [ ] **Step 3: Rewrite the textarea `onKeyDown`**

In `src/components/GridCell.tsx`, replace the `onKeyDown` handler on the `<textarea>`:

```tsx
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter inserts a literal newline (tag ⏎ cite) within the cell.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd, value } = el;
            const next = value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
            updateNodeText(node.id, next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = selectionStart + 1;
              autoHeight();
            });
            return;
          }
          // Plain Enter / Shift+Enter are left for the global keymap layer
          // (node.addAnswer / node.answerAcross). Do not intercept them here.
        }}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/GridCell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manually verify the create flow**

Run: `npm run dev`, open a flow sheet, click a cell, type, press `Enter` → a new sibling cell appears below and is focused; `Shift+Enter` → a cell appears in the next opposing column; `Ctrl+Enter` → newline within the cell. Confirm before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/GridCell.tsx src/components/GridCell.test.tsx
git commit -m "feat(grid): Enter/Shift+Enter create flow; Ctrl+Enter in-cell newline"
```

---

### Task 6: Free-placement typing in an empty cell

Today clicking an empty cell only sets `selection.nodeId = ""`; you must press a key bound to `edit.enter` to create. Make a selected empty cell render a live textarea so you can **just start typing** — the first input creates the node.

**Files:**
- Modify: `src/components/FlowGrid.tsx:167-197` (empty-cell branch)
- Create: `src/components/EmptyCellEditor.tsx`
- Test: `src/components/FlowGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/FlowGrid.test.tsx`:

```ts
it("typing in a selected empty cell creates a node with that text", () => {
  // render FlowGrid for a sheet; set selection to an empty accessible cell
  useRoundStore.getState().setSelection({ sheetId, speechId: "1nc", nodeId: "" });
  // re-render; the empty selected cell now shows a textbox
  const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: "topicality" } });
  const created = useRoundStore.getState().round!.nodes.find((n) => n.text === "topicality");
  expect(created).toBeTruthy();
  expect(created!.speechId).toBe("1nc");
  expect(created!.parentId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/FlowGrid.test.tsx`
Expected: FAIL — empty selected cell renders a `<span class="cell-empty">`, no textbox.

- [ ] **Step 3: Create the empty-cell editor**

Create `src/components/EmptyCellEditor.tsx`:

```tsx
"use client";

/**
 * EmptyCellEditor — shown when a blank cell is selected. The first keystroke
 * creates a real node (root in this column) and hands editing off to GridCell.
 */
import { useEffect, useRef } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";

export default function EmptyCellEditor({
  sheetId,
  speechId,
}: {
  sheetId: string;
  speechId: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const addNode = useRoundStore((s) => s.addNode);
  const setSelection = useRoundStore((s) => s.setSelection);
  const updateNodeText = useRoundStore((s) => s.updateNodeText);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <textarea
      ref={ref}
      className="cell-input"
      rows={1}
      spellCheck={false}
      value=""
      onChange={(e) => {
        const id = addNode({ sheetId, speechId, parentId: null, text: e.target.value });
        updateNodeText(id, e.target.value);
        setSelection({ sheetId, speechId, nodeId: id });
      }}
    />
  );
}
```

In `src/components/FlowGrid.tsx`, import it and replace the empty-cell `<span className="cell-empty" />` with a conditional: render `EmptyCellEditor` when this empty cell is the current selection, else the span. Replace the empty-cell `return` block:

```tsx
              return (
                <td
                  key={col}
                  className={classes}
                  onClick={() => setSelection({ sheetId, speechId: speech.id, nodeId: "" })}
                >
                  {isSelected ? (
                    <EmptyCellEditor sheetId={sheetId} speechId={speech.id} />
                  ) : (
                    <span className="cell-empty" />
                  )}
                </td>
              );
```

Add the import at the top of `FlowGrid.tsx`:

```tsx
import EmptyCellEditor from "./EmptyCellEditor";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/FlowGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/EmptyCellEditor.tsx src/components/FlowGrid.tsx src/components/FlowGrid.test.tsx
git commit -m "feat(grid): type-to-create in a selected empty cell"
```

---

### Task 7: Per-sheet columns (`startSpeechId`)

Real neg off-case sheets begin at 1NC (no 1AC column). Give each sheet a leftmost speech and render only columns from there onward.

**Files:**
- Modify: `src/lib/model/types.ts` (Sheet)
- Create: `src/lib/grid/columns.ts` + `src/lib/grid/columns.test.ts`
- Modify: `src/lib/store/useRoundStore.ts` (addSheet sets startSpeechId)
- Modify: `src/components/FlowGrid.tsx:41` (use columnsForSheet)

- [ ] **Step 1: Write the failing test**

Create `src/lib/grid/columns.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { columnsForSheet } from "@/lib/grid/columns";
import type { Format, Sheet } from "@/lib/model/types";

const fmt = {
  speeches: [
    { id: "1ac", name: "1AC", side: "aff", seconds: 0 },
    { id: "1nc", name: "1NC", side: "neg", seconds: 0 },
    { id: "2ac", name: "2AC", side: "aff", seconds: 0 },
  ],
} as Format;

const sheet = (over: Partial<Sheet>): Sheet =>
  ({ id: "s", title: "t", group: "neg", order: 0, kind: "flow", ...over }) as Sheet;

describe("columnsForSheet", () => {
  it("returns speeches from startSpeechId onward", () => {
    expect(columnsForSheet(fmt, sheet({ startSpeechId: "1nc" })).map((s) => s.id)).toEqual([
      "1nc",
      "2ac",
    ]);
  });
  it("defaults a neg sheet to the first neg speech when startSpeechId is absent", () => {
    expect(columnsForSheet(fmt, sheet({ group: "neg" })).map((s) => s.id)).toEqual(["1nc", "2ac"]);
  });
  it("defaults an aff sheet to all speeches", () => {
    expect(columnsForSheet(fmt, sheet({ group: "aff" })).map((s) => s.id)).toEqual([
      "1ac",
      "1nc",
      "2ac",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/grid/columns.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/grid/columns.ts`:

```ts
import type { Format, Sheet, Speech } from "@/lib/model/types";

/**
 * The speech columns a flow sheet shows: from its leftmost speech to the end of
 * the format. The leftmost is `sheet.startSpeechId` if set; otherwise it is
 * derived from the sheet's side (aff → first speech; neg → first neg speech).
 */
export function columnsForSheet(format: Format, sheet: Sheet): Speech[] {
  const speeches = format.speeches;
  let startId = sheet.startSpeechId;
  if (!startId) {
    startId =
      sheet.group === "neg"
        ? (speeches.find((s) => s.side === "neg")?.id ?? speeches[0]?.id)
        : speeches[0]?.id;
  }
  const idx = speeches.findIndex((s) => s.id === startId);
  return idx === -1 ? speeches : speeches.slice(idx);
}
```

In `src/lib/model/types.ts`, add to `Sheet`:

```ts
  /** Leftmost speech column shown (absent = derive from side). */
  startSpeechId?: string;
```

In `src/lib/store/useRoundStore.ts` `addSheet`, set it on the new sheet:

```ts
    const firstNeg = round.format.speeches.find((s) => s.side === "neg")?.id;
    const sheet: Sheet = {
      id: uid("sheet"),
      title,
      group,
      order: maxOrder + 1,
      kind: "flow",
      startSpeechId: group === "neg" ? firstNeg : round.format.speeches[0]?.id,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/grid/columns.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire FlowGrid to it**

In `src/components/FlowGrid.tsx`, replace line 41:

```tsx
const speeches = isCx ? CX_COLUMNS : format.speeches;
```

with:

```tsx
import { columnsForSheet } from "@/lib/grid/columns";
// ...
const speeches = isCx ? CX_COLUMNS : sheet ? columnsForSheet(format, sheet) : format.speeches;
```

(Place the import with the other top-level imports.) Note: `buildLayout` still receives this `speeches` array, so its `colIndex` continues to map `speechId → column` correctly for the visible subset; nodes whose `speechId` isn't in the subset are filtered out by `buildLayout`'s existing `validNodes` guard.

- [ ] **Step 6: Run the full suite + manual check**

Run: `npm test -- --run`
Expected: green. Then `npm run dev`: a new neg sheet shows 1NC as its first column; aff case sheet shows 1AC. Confirm.

- [ ] **Step 7: Commit**

```bash
git add src/lib/grid/columns.ts src/lib/grid/columns.test.ts src/lib/model/types.ts src/lib/store/useRoundStore.ts src/components/FlowGrid.tsx
git commit -m "feat(grid): per-sheet columns via startSpeechId"
```

---

### Task 8: Drag-to-move (re-parent / re-home a cell)

Manual override of placement: drag a cell onto another cell to make it answer that argument (`setNodeParent`); drag onto an empty cell to re-home it (change `speechId`, become a root there).

**Files:**
- Modify: `src/lib/store/useRoundStore.ts` (interface already has `setNodeParent`; add `rehomeNode`)
- Modify: `src/lib/model/tree.ts` (add `rehomeNode`)
- Modify: `src/components/GridCell.tsx` (draggable + drop target)
- Modify: `src/components/FlowGrid.tsx` (empty cell as drop target)
- Test: `src/lib/model/tree.test.ts`, `src/components/FlowGrid.test.tsx`

- [ ] **Step 1: Write the failing test (pure op)**

Add to `src/lib/model/tree.test.ts`:

```ts
it("rehomeNode moves a node to a new column as a root", () => {
  const a = addNode([], { sheetId: "s", speechId: "1ac", parentId: null });
  const b = addNode(a.nodes, { sheetId: "s", speechId: "1ac", parentId: a.node.id });
  const moved = rehomeNode(b.nodes, b.node.id, "2ac", null);
  const n = moved.find((x) => x.id === b.node.id)!;
  expect(n.speechId).toBe("2ac");
  expect(n.parentId).toBeNull();
});
```

Import `rehomeNode` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/model/tree.test.ts`
Expected: FAIL — `rehomeNode` not exported.

- [ ] **Step 3: Implement the pure op + store action**

Append to `src/lib/model/tree.ts`:

```ts
/**
 * Moves a node to a different column (speechId) and parent, appending it at the
 * end of the destination column. Used by drag-to-move.
 */
export function rehomeNode(
  nodes: ArgumentNode[],
  nodeId: string,
  speechId: string,
  parentId: string | null,
): ArgumentNode[] {
  const column = nodes.filter((n) => {
    const target = nodes.find((x) => x.id === nodeId);
    return target && n.sheetId === target.sheetId && n.speechId === speechId && n.id !== nodeId;
  });
  const newOrder = column.length > 0 ? Math.max(...column.map((n) => n.order)) + 1 : 0;
  return nodes.map((n) => (n.id === nodeId ? { ...n, speechId, parentId, order: newOrder } : n));
}
```

In `src/lib/store/useRoundStore.ts`, add to `RoundActions`:

```ts
  rehomeNode(nodeId: string, speechId: string, parentId: string | null): void;
```

Add the import (`rehomeNode as treeRehomeNode`) and the action:

```ts
  rehomeNode(nodeId, speechId, parentId) {
    if (!get().round) return;
    get()._commit(null, (r) => ({ ...r, nodes: treeRehomeNode(r.nodes, nodeId, speechId, parentId) }));
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/model/tree.test.ts`
Expected: PASS. Commit this slice:

```bash
git add src/lib/model/tree.ts src/lib/model/tree.test.ts src/lib/store/useRoundStore.ts
git commit -m "feat(model): rehomeNode pure op + store action for drag-to-move"
```

- [ ] **Step 5: Write the failing UI test**

Add to `src/components/FlowGrid.test.tsx`:

```ts
it("dropping a node onto another sets the dragged node's parent to the target", () => {
  // sheet with node A (1ac root) and node B (1nc root)
  const tdB = screen.getByText("B-text").closest("td")!;
  fireEvent.dragStart(screen.getByText("B-text"), { dataTransfer: { setData: () => {} } });
  fireEvent.drop(tdB, { dataTransfer: { getData: () => idA } });
  // dragging A onto B → A.parentId === idB
  expect(useRoundStore.getState().round!.nodes.find((n) => n.id === idA)!.parentId).toBe(idB);
});
```

(Adjust to the file's render helper; the key behavior is `drop` calling `setNodeParent(draggedId, targetId)`.)

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- --run src/components/FlowGrid.test.tsx`
Expected: FAIL — cells are not drag/drop wired.

- [ ] **Step 7: Wire drag/drop**

In `src/components/GridCell.tsx`, make the display `<span>` draggable and a drop target. Add to the outer display `<span>` (non-insert branch):

```tsx
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/df-node", node.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const dragged = e.dataTransfer.getData("text/df-node");
        if (dragged && dragged !== node.id) {
          useRoundStore.getState().setNodeParent(dragged, node.id);
        }
      }}
      onClick={handleClick}
      style={{ display: "block", width: "100%", cursor: "pointer" }}
    >
```

In `src/components/FlowGrid.tsx`, make the empty `<td>` a drop target that re-homes the dragged node into that column as a root — add to the empty-cell `<td>`:

```tsx
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragged = e.dataTransfer.getData("text/df-node");
                    if (dragged) useRoundStore.getState().rehomeNode(dragged, speech.id, null);
                  }}
```

- [ ] **Step 8: Run test + manual check**

Run: `npm test -- --run src/components/FlowGrid.test.tsx`
Expected: PASS. Then `npm run dev`: drag a cell onto another → it becomes a response to it (aligns into its band); drag onto a blank cell → it moves to that column. Confirm.

- [ ] **Step 9: Commit**

```bash
git add src/components/GridCell.tsx src/components/FlowGrid.tsx src/components/FlowGrid.test.tsx
git commit -m "feat(grid): drag-to-move cells (reparent / rehome)"
```

---

### Task 9: Persistence — Dexie upgrade defaulting `bold`; confirm JSON round-trip

`normalizeRound` (Task 1) already defaults `bold` on import, and `bold` rides along in the JSON envelope automatically. Add a Dexie version bump so rounds saved before this plan gain `bold` on read.

**Files:**
- Modify: `src/lib/persistence/db.ts`
- Test: `src/lib/persistence/io.test.ts` (round-trip), `src/lib/persistence/db.test.ts` (upgrade)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/persistence/io.test.ts`:

```ts
it("preserves bold through export → import", () => {
  const round = /* build a round with one node bold:true (reuse helpers) */;
  const back = importRoundJSON(exportRoundJSON(round));
  expect(back.nodes[0].bold).toBe(true);
});

it("defaults bold to false for a node missing it (legacy file)", () => {
  const legacy = /* round JSON whose node omits bold */;
  const back = importRoundJSON(JSON.stringify({ version: 1, round: legacy }));
  expect(back.nodes[0].bold).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/persistence/io.test.ts`
Expected: the legacy-default test FAILS if `normalizeRound`'s node-mapping (Task 1) was skipped; otherwise it PASSES — in which case treat Step 3 as the Dexie-only change and keep these as regression guards.

- [ ] **Step 3: Add the Dexie version bump**

In `src/lib/persistence/db.ts`, after the `this.version(2)...` block:

```ts
    this.version(3).upgrade((tx) =>
      tx
        .table("rounds")
        .toCollection()
        .modify((r: { nodes?: Array<{ bold?: boolean }> }) => {
          if (Array.isArray(r.nodes)) {
            r.nodes = r.nodes.map((n) => ({ ...n, bold: n.bold ?? false }));
          }
        }),
    );
```

If `src/lib/persistence/db.test.ts` exists and asserts the schema version, add a case that a v2 round with a `bold`-less node reads back with `bold === false`; otherwise rely on the io.test.ts guards.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/persistence/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/persistence/db.ts src/lib/persistence/io.test.ts
git commit -m "feat(persistence): Dexie v3 defaults bold on existing rounds"
```

---

### Task 10: Delete the dead box-tree engine

`src/lib/editor/*` has no importers outside itself (verified). Remove it and its tests now that the live model carries the design.

**Files:**
- Delete: `src/lib/editor/` (types, boxes, action, history, pending, navigation, decorate + `*.test.ts`)

- [ ] **Step 1: Confirm no live importers**

Run: `grep -rn "@/lib/editor" src --include='*.ts' --include='*.tsx' | grep -v "src/lib/editor/"`
Expected: no output.

- [ ] **Step 2: Delete the directory**

Run: `git rm -r src/lib/editor`

- [ ] **Step 3: Verify build + tests**

Run: `npm run -s typecheck 2>/dev/null || npx tsc --noEmit` then `npm test -- --run`
Expected: typecheck clean (no new errors vs. the pre-existing ones noted in the baseline); test count drops by the 56 editor tests and the remainder stays green.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(editor): remove unused depth=column box-tree engine"
```

---

## Self-Review

**Spec coverage:**
- `bold` field + decoration display → Tasks 1, 4. ✓
- `Enter`/`Shift+Enter` create semantics → Task 5 (bindings already existed). ✓
- Free-placement typing → Task 6. ✓
- Drag-to-move override → Task 8. ✓
- Per-sheet columns (`startSpeechId`) → Task 7. ✓
- `format.toggleBold` command → Task 3. ✓
- Additive persistence (Dexie + JSON) → Tasks 1, 9. ✓
- Delete dead engine → Task 10. ✓
- Modeless default / vim alternate → already in `presets.ts`; unchanged. ✓
- Drops / numbering already read the tree → unchanged, regression-guarded by the full suite. ✓
- Groups, cross-apps → out of this plan by design (Plans 2 & 3).

**Type consistency:** `toggleBold` (tree) → `toggleNodeBold` (store) → `format.toggleBold` (command) are distinct, intentional names across layers. `rehomeNode` (tree) → `rehomeNode` (store action) match. `columnsForSheet(format, sheet)` signature used identically in test and `FlowGrid`. `startSpeechId` optional on `Sheet` used in `columns.ts`, `addSheet`, and tests.

**Placeholder scan:** Test bodies that say "reuse the file's helpers" point at concrete existing patterns (the files already have round/node bootstrap); every code change to ship has complete code. No TBD/TODO.
