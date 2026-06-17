# Flow Straight Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global "Flow straight down" display setting that makes the flow behave like a plain spreadsheet — Enter spawns a new root cell below, and cross-column argument responses are disabled.

**Architecture:** A new global boolean `straightDown` lives in the Zustand `useRoundStore` alongside `autoNumber`/`labelDrops`, persisted to localStorage. Command handlers (`commands.ts`) read it to change Enter / answer-across behavior on flow sheets only. Display consumers (`FlowGrid`, `Sidebar`) read it to suppress drop detection. `SettingsPanel` exposes the toggle and disables the two now-meaningless toggles.

**Tech Stack:** Next.js, React, Zustand, Radix UI (Switch/Dialog), Vitest + Testing Library.

## Global Constraints

- Default `straightDown` to `false` so existing users are unaffected.
- Straight-down behavior applies to **flow sheets only**; CX sheets are never affected (`isCxSheet` guard).
- Non-destructive: toggling the setting never mutates node data.
- Test runner: `npx vitest run <path>` for a file; `npm test` for the full suite.
- No `Co-Authored-By` / Claude attribution in commit messages.

---

### Task 1: Store — `straightDown` state, action, and persistence

**Files:**
- Modify: `src/lib/store/useRoundStore.ts`
- Test: `src/lib/store/useRoundStore.test.ts`

**Interfaces:**
- Consumes: existing `DisplaySettings` (`{ autoNumber, labelDrops }`), `saveDisplaySettings`, `setAutoNumber` pattern.
- Produces:
  - State field `straightDown: boolean` on `RoundState`.
  - Action `setStraightDown(v: boolean): void` on `RoundActions`.
  - `DisplaySettings` gains `straightDown: boolean`; `load/saveDisplaySettings` round-trip it (default `false`).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/store/useRoundStore.test.ts`:

```ts
describe("straightDown display setting", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useRoundStore.setState({ straightDown: false });
  });

  it("defaults to false", () => {
    expect(useRoundStore.getState().straightDown).toBe(false);
  });

  it("setStraightDown updates state and persists all three display flags", () => {
    useRoundStore.getState().setAutoNumber(true);
    useRoundStore.getState().setLabelDrops(true);
    useRoundStore.getState().setStraightDown(true);

    expect(useRoundStore.getState().straightDown).toBe(true);

    const raw = window.localStorage.getItem("df-display-settings");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toEqual({ autoNumber: true, labelDrops: true, straightDown: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/store/useRoundStore.test.ts -t "straightDown"`
Expected: FAIL — `setStraightDown` is not a function / `straightDown` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/store/useRoundStore.ts`:

1. Add to the `RoundState` interface, after `labelDrops: boolean;` (around line 50):

```ts
  straightDown: boolean;
```

2. Add to the `RoundActions` interface, after `setLabelDrops(v: boolean): void;` (around line 102):

```ts
  setStraightDown(v: boolean): void;
```

3. Update the `DisplaySettings` interface (around line 164):

```ts
interface DisplaySettings {
  autoNumber: boolean;
  labelDrops: boolean;
  straightDown: boolean;
}
```

4. Update `loadDisplaySettings` (around line 169) — fallback and parse:

```ts
function loadDisplaySettings(): DisplaySettings {
  const fallback: DisplaySettings = { autoNumber: true, labelDrops: true, straightDown: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      autoNumber: typeof p.autoNumber === "boolean" ? p.autoNumber : true,
      labelDrops: typeof p.labelDrops === "boolean" ? p.labelDrops : true,
      straightDown: typeof p.straightDown === "boolean" ? p.straightDown : false,
    };
  } catch {
    return fallback;
  }
}
```

5. Add to the store's initial state, after `labelDrops: initialDisplaySettings.labelDrops,` (around line 214):

```ts
  straightDown: initialDisplaySettings.straightDown,
```

6. Update the two existing setters to persist `straightDown`, and add the new setter. Replace the `setAutoNumber` and `setLabelDrops` bodies (around lines 500-508):

```ts
  setAutoNumber(v) {
    set({ autoNumber: v });
    saveDisplaySettings({
      autoNumber: v,
      labelDrops: get().labelDrops,
      straightDown: get().straightDown,
    });
  },

  setLabelDrops(v) {
    set({ labelDrops: v });
    saveDisplaySettings({
      autoNumber: get().autoNumber,
      labelDrops: v,
      straightDown: get().straightDown,
    });
  },

  setStraightDown(v) {
    set({ straightDown: v });
    saveDisplaySettings({
      autoNumber: get().autoNumber,
      labelDrops: get().labelDrops,
      straightDown: v,
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/store/useRoundStore.test.ts -t "straightDown"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): add straightDown display setting"
```

---

### Task 2: Commands — Enter spawns root cell, answer-across disabled (flow sheets only)

**Files:**
- Modify: `src/lib/commands/commands.ts:126-162`
- Test: `src/lib/commands/commands.test.ts`

**Interfaces:**
- Consumes: `state.straightDown` (Task 1), existing `isCxSheet(round, sheetId)` helper in `commands.ts`.
- Produces: no new exports; changes the runtime behavior of `node.addAnswer` and `node.answerAcross` when `straightDown` is on.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/commands/commands.test.ts`. The `resetStore` helper there sets `BLANK_STATE` (which does not include `straightDown`), so each test sets it explicitly.

```ts
describe("straightDown behavior", () => {
  beforeEach(() => {
    resetStore();
    useRoundStore.setState({ straightDown: true });
  });
  afterEach(() => {
    useRoundStore.setState({ straightDown: false });
  });

  it("node.addAnswer creates a ROOT cell below even from a child node", () => {
    const { sheetId, speeches } = setupRound();
    const affSp = speeches[0].id; // 1AC aff
    const negSp = speeches[1].id; // 1NC neg
    const root = useRoundStore.getState().addNode({ sheetId, speechId: affSp, parentId: null });
    // A pre-existing child (e.g. created before straight-down was turned on).
    const child = useRoundStore
      .getState()
      .addNode({ sheetId, speechId: negSp, parentId: root });
    useRoundStore.getState().setSelection({ sheetId, speechId: negSp, nodeId: child });

    executeCommand("node.addAnswer");
    const st = useRoundStore.getState();
    const created = st.round!.nodes.find((n) => n.id === st.selection!.nodeId);
    expect(created?.parentId).toBeNull();
    expect(created?.speechId).toBe(negSp);
  });

  it("node.answerAcross is a no-op on a flow sheet", () => {
    const { sheetId, speeches } = setupRound();
    const affSp = speeches[0].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: affSp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: affSp, nodeId: a });
    const before = useRoundStore.getState().round!.nodes.length;

    executeCommand("node.answerAcross");
    expect(useRoundStore.getState().round!.nodes.length).toBe(before);
  });
});
```

Note: add `afterEach` to the vitest import at the top of the file if it is not already imported (current import is `{ describe, it, expect, beforeEach }`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/commands/commands.test.ts -t "straightDown behavior"`
Expected: FAIL — `node.addAnswer` currently copies `parentId` (so `created.parentId` is `root`, not null); `node.answerAcross` creates a node (so the length grows).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/commands/commands.ts`, update the `node.addAnswer` case (line 126):

```ts
    case "node.addAnswer": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      const node = round.nodes.find((n) => n.id === sel.nodeId);
      if (!node) return;
      // Straight-down (flow sheets only): every Enter spawns a fresh root cell
      // directly below, ignoring any existing parent link.
      const straight = state.straightDown && !isCxSheet(round, node.sheetId);
      const newId = state.addNode({
        sheetId: node.sheetId,
        speechId: node.speechId,
        parentId: straight ? null : node.parentId,
        insertAfterOrder: node.order,
      });
      selectNodeInsert({ sheetId: node.sheetId, speechId: node.speechId, nodeId: newId });
      return;
    }
```

Update the `node.answerAcross` case (line 142) — add the guard right after fetching `node`:

```ts
    case "node.answerAcross": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      const node = round.nodes.find((n) => n.id === sel.nodeId);
      if (!node) return;
      // Straight-down disables responses on flow sheets; CX Q→Response is unaffected.
      if (state.straightDown && !isCxSheet(round, node.sheetId)) return;
      let targetSpeechId: string | null;
      if (isCxSheet(round, node.sheetId)) {
        targetSpeechId = responseColumnFor(node.speechId); // Q → its Response column
      } else {
        targetSpeechId = nextOpposingSpeech(round.format, node.speechId)?.id ?? null;
      }
      if (!targetSpeechId) return;
      const newId = state.addNode({
        sheetId: node.sheetId,
        speechId: targetSpeechId,
        parentId: node.id,
      });
      selectNodeInsert({ sheetId: node.sheetId, speechId: targetSpeechId, nodeId: newId });
      return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/commands/commands.test.ts`
Expected: PASS — the new `straightDown behavior` block passes and the existing `node.addAnswer` / `node.answerAcross` tests (which run with `straightDown` defaulting to false/absent) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/commands.ts src/lib/commands/commands.test.ts
git commit -m "feat(commands): straight-down Enter spawns root cell, disables answer-across"
```

---

### Task 3: Suppress drop detection when straight-down is on

**Files:**
- Modify: `src/components/FlowGrid.tsx:48`
- Modify: `src/components/Sidebar.tsx:84`
- Test: `src/components/FlowGrid.test.tsx`

**Interfaces:**
- Consumes: `state.straightDown` (Task 1) via `useRoundStore` hook.
- Produces: with `straightDown` on, no node renders a drop marker and sidebar drop counts read 0. Gated at the display consumers; the pure `selectDrops`/`detectDrops` functions are unchanged.

- [ ] **Step 1: Write the failing test**

First inspect `src/components/FlowGrid.test.tsx` to match its existing render/setup helpers (how it builds a round, renders `<FlowGrid sheetId=... />`, and queries drop markers — look for the existing drop test and its `data-testid`/text query). Then add a test mirroring that setup that turns on straight-down and asserts no drop marker appears.

```ts
it("renders no drop markers when straightDown is on", () => {
  // ARRANGE: reuse this file's existing helper to build a sheet with a node
  // that WOULD be dropped (a node in an early speech with later opposing content
  // and no answer). Confirm the existing drop test's query/testid and reuse it.
  // Then enable straight-down before rendering:
  useRoundStore.setState({ straightDown: true, labelDrops: true });

  render(<FlowGrid sheetId={sheetId} />);

  // The drop marker query used by this file's existing drop test must find nothing.
  expect(screen.queryByTestId("drop-marker")).toBeNull();
});
```

If the existing drop test uses a different selector than `drop-marker`, use that exact selector here instead. Reset with `useRoundStore.setState({ straightDown: false })` in an `afterEach` or at the end of the test so other tests are unaffected.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FlowGrid.test.tsx -t "straightDown"`
Expected: FAIL — drop markers still render because `droppedIds` ignores `straightDown`.

- [ ] **Step 3: Write minimal implementation**

In `src/components/FlowGrid.tsx`, add a subscription near the other store hooks (after line 41 where `isCx` is computed is fine, but the hook must be with the others — add alongside line 32-39 group):

```ts
  const straightDown = useRoundStore((s) => s.straightDown);
```

Then change line 48:

```ts
  const droppedIds =
    isCx || straightDown ? new Set<string>() : new Set(detectDrops(nodes, format, sheetId));
```

In `src/components/Sidebar.tsx`, add the subscription near line 30:

```ts
  const straightDown = useRoundStore((s) => s.straightDown);
```

Then change the `dropCount` prop (line 84) from:

```ts
                    dropCount={labelDrops ? selectSheetDropCount(round, sheet.id) : 0}
```

to:

```ts
                    dropCount={labelDrops && !straightDown ? selectSheetDropCount(round, sheet.id) : 0}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/FlowGrid.test.tsx`
Expected: PASS — new test passes; existing drop tests (straightDown false) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/FlowGrid.tsx src/components/Sidebar.tsx src/components/FlowGrid.test.tsx
git commit -m "feat(flow): suppress drop detection when flowing straight down"
```

---

### Task 4: SettingsPanel — add toggle and disable dependent toggles

**Files:**
- Modify: `src/components/SettingsPanel.tsx:44-47,173-193`
- Test: `src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `straightDown` + `setStraightDown` (Task 1).
- Produces: a `toggle-straightDown` switch in the Display category; `toggle-autoNumber` and `toggle-labelDrops` carry `disabled` when `straightDown` is true.

- [ ] **Step 1: Write the failing test**

Add to `src/components/SettingsPanel.test.tsx` (it already imports `render, screen, within, userEvent` and has a `resetStore`/`localStorage.clear` `beforeEach`):

```ts
it("toggles straightDown via the display switch", async () => {
  useRoundStore.getState().setSettingsOpen(true);
  render(<SettingsPanel />);
  const sw = screen.getByTestId("toggle-straightDown");
  await userEvent.click(sw);
  expect(useRoundStore.getState().straightDown).toBe(true);
  useRoundStore.getState().setStraightDown(false);
});

it("disables autoNumber and labelDrops toggles when straightDown is on", () => {
  useRoundStore.setState({ settingsOpen: true, straightDown: true });
  render(<SettingsPanel />);
  expect(screen.getByTestId("toggle-autoNumber")).toBeDisabled();
  expect(screen.getByTestId("toggle-labelDrops")).toBeDisabled();
  useRoundStore.setState({ straightDown: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SettingsPanel.test.tsx -t "straightDown"`
Expected: FAIL — `toggle-straightDown` not found; autoNumber/labelDrops switches are not disabled.

- [ ] **Step 3: Write minimal implementation**

In `src/components/SettingsPanel.tsx`:

1. Add store selectors alongside the existing display ones (after line 47):

```ts
  const straightDown = useRoundStore((s) => s.straightDown);
  const setStraightDown = useRoundStore((s) => s.setStraightDown);
```

2. Replace the Display category block (lines 173-193) so the two existing toggles are disabled when straight-down is on and the new toggle is added below them:

```tsx
            {category === "display" ? (
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between py-1.5 text-[13px] text-zinc-900">
                  Auto-number arguments
                  <Switch
                    checked={autoNumber}
                    onCheckedChange={setAutoNumber}
                    disabled={straightDown}
                    data-testid="toggle-autoNumber"
                    aria-label="Auto-number arguments"
                  />
                </label>
                <label className="flex items-center justify-between py-1.5 text-[13px] text-zinc-900">
                  Label drops
                  <Switch
                    checked={labelDrops}
                    onCheckedChange={setLabelDrops}
                    disabled={straightDown}
                    data-testid="toggle-labelDrops"
                    aria-label="Label drops"
                  />
                </label>
                <label className="flex items-center justify-between py-1.5 text-[13px] text-zinc-900">
                  <span className="flex flex-col">
                    Flow straight down
                    <span className="text-[11px] text-zinc-400">
                      Cells stack below; responses, numbering, and drops are off.
                    </span>
                  </span>
                  <Switch
                    checked={straightDown}
                    onCheckedChange={setStraightDown}
                    data-testid="toggle-straightDown"
                    aria-label="Flow straight down"
                  />
                </label>
              </div>
            ) : (
```

(The `disabled` prop on the existing two `Switch`es is the only change to them; the new `<label>` is added before the closing `</div>`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SettingsPanel.test.tsx`
Expected: PASS — new tests pass; the existing `toggles autoNumber via the display switch` test still passes (straightDown defaults false, so the switch is enabled).

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel.tsx src/components/SettingsPanel.test.tsx
git commit -m "feat(settings): add Flow straight down toggle"
```

---

### Task 5: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — entire suite green, including untouched export / numbering / drops unit tests.

- [ ] **Step 2: Typecheck / build sanity**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run the app, open Settings → Display, enable "Flow straight down". Confirm: Enter in a column stacks a new cell below; Shift+Enter does nothing on a flow sheet; the Auto-number and Label-drops toggles are greyed out; drop markers disappear. Toggle off and confirm normal behavior returns.

---

## Self-Review Notes

- **Spec coverage:** setting + persistence (Task 1) ✓; Enter root cell + answer-across disabled, flow-only (Task 2) ✓; numbering stays dead — no code, covered by non-goal ✓; drop suppression (Task 3) ✓; disabled dependent toggles (Task 4) ✓; CX unaffected — guarded by `isCxSheet` in Task 2 ✓.
- **Type consistency:** `straightDown` / `setStraightDown` names used identically across store, commands, FlowGrid, Sidebar, SettingsPanel; `DisplaySettings` shape `{ autoNumber, labelDrops, straightDown }` matches the persistence test in Task 1.
- **Non-goals honored:** no change to `numbering.ts`, no CX flattening, no cheatsheet change, no node mutation.
