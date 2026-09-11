# Argument Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Extend command that copies one vertical argument run into the next same-side speech without linking the copies.

**Architecture:** A focused grid helper finds the destination and builds one column insertion while it carries cell metadata. The command layer validates the live selection, expands blank grid capacity, applies one structured write, records collaboration operations, and selects the copy.

**Tech Stack:** TypeScript 6, React 19, Zustand 5, Handsontable 18, Vitest 4, Testing Library, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-09-10-argument-extension-design.md`

## Global Constraints

- Extend accepts exactly one selected vertical run in one normal speech column.
- The destination is the first later speech with the same `SpeechCol.side` value.
- The destination insertion starts at the source row and moves only that column tail down.
- The copy preserves text, bold, highlight, card, group, blank positions, and CardMirror provenance.
- The copy clears `kicked` and does not copy `answers`.
- The source stays unchanged and has no persistent link to the copy.
- One undo or redo restores text and metadata for the complete operation.
- Shared editing receives structural `insertCell` operations before copied text and metadata operations.
- The `.ebb` schema and `CellMeta` interface do not change.
- Use ASCII text in source comments and user-visible copy.

## File Structure

- Create `src/lib/grid/extendCells.ts`: destination calculation, tail measurement, metadata-safe run insertion.
- Create `test/lib/grid/extendCells.test.ts`: pure destination and transform behavior.
- Modify `src/lib/commands/commands.ts`: live-grid validation, capacity growth, write, undo, collaboration, and selection.
- Modify `test/lib/commands/commands.test.ts`: command success, refusal, selection, undo, and redo behavior.
- Modify `test/lib/commands/collabSeams.test.ts`: projected shared-editing contract.
- Modify `src/lib/commands/registry.ts`: register and grade `cell.extend`.
- Modify `src/lib/keymap/presets.ts`: assign Mod+E to Extend and remove the Jump-to-source default.
- Modify `test/lib/keymap/presets.test.ts`: verify the new binding and removed binding.
- Modify `src/lib/keymap/reserved.ts`: keep Mod+E reserved for the new command.
- Modify `src/lib/grid/contextMenu.ts`: add the Extend item against the menu grid.
- Modify `test/lib/grid/contextMenu.test.ts`: verify the item and callback grid.
- Modify `src/components/palette/KeybindingsCheatsheet.tsx`: list Extend in the grid section.

---

### Task 1: Pure Extension Grid Transform

**Files:**
- Create: `src/lib/grid/extendCells.ts`
- Create: `test/lib/grid/extendCells.test.ts`

**Interfaces:**
- Consumes: `CellGrid`, `CellChange`, and `shiftSpan` from `@/lib/grid/cellShift`; `GridCol` from `@/lib/grid/colSpace`; `SpeechCol` from `@/lib/grid/flowColumns`.
- Produces: `nextSameSideColumn(columns: readonly SpeechCol[], sourceCol: number): number | null`.
- Produces: `extensionRequiredRows(grid: CellGrid, targetCol: GridCol, startRow: number, height: number): number`.
- Produces: `extendRun(grid: CellGrid, input: ExtendRunInput): CellChange[]`.
- Produces: `ExtendRunInput` with `sourceCol`, `targetCol`, `startRow`, and `height`.

- [ ] **Step 1: Write the destination tests**

Create `test/lib/grid/extendCells.test.ts` with explicit speech columns:

```ts
import { describe, expect, it } from "vitest";

import {
    extendRun,
    extensionRequiredRows,
    nextSameSideColumn,
} from "@/lib/grid/extendCells";
import { BOLD_CLASS, GROUP_CLASS, HIGHLIGHT_CLASS, KICKED_CLASS } from "@/lib/grid/codec";
import { gridCol } from "@/lib/grid/colSpace";
import type { SpeechCol } from "@/lib/grid/flowColumns";

import { fakeGrid } from "../../support/fakeHot";

const columns: SpeechCol[] = [
    { id: "1ac", name: "1AC", short: "1AC", side: "aff" },
    { id: "1nc", name: "1NC", short: "1NC", side: "neg" },
    { id: "2ac", name: "2AC", short: "2AC", side: "aff" },
    { id: "2nc", name: "2NC", short: "2NC", side: "neg" },
];

describe("nextSameSideColumn", () => {
    it("skips the intervening opponent speech", () => {
        expect(nextSameSideColumn(columns, 0)).toBe(2);
        expect(nextSameSideColumn(columns, 1)).toBe(3);
    });

    it("returns null for the side's last speech and an overflow column", () => {
        expect(nextSameSideColumn(columns, 2)).toBeNull();
        expect(nextSameSideColumn(columns, 8)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the destination tests and observe the missing module failure**

Run: `npm test -- test/lib/grid/extendCells.test.ts`

Expected: FAIL because `@/lib/grid/extendCells` does not exist.

- [ ] **Step 3: Implement destination calculation**

Create `src/lib/grid/extendCells.ts` with this contract:

```ts
import type { CellChange, CellGrid } from "@/lib/grid/cellShift";
import { shiftSpan } from "@/lib/grid/cellShift";
import type { GridCol } from "@/lib/grid/colSpace";
import type { SpeechCol } from "@/lib/grid/flowColumns";
import type { CellSource } from "@/lib/model/flow";

export interface ExtendRunInput {
    sourceCol: GridCol;
    targetCol: GridCol;
    startRow: number;
    height: number;
}

export function nextSameSideColumn(
    columns: readonly SpeechCol[],
    sourceCol: number,
): number | null {
    const source = columns[sourceCol];
    if (!source) return null;
    const offset = columns.slice(sourceCol + 1).findIndex((column) => column.side === source.side);
    return offset === -1 ? null : sourceCol + offset + 1;
}
```

- [ ] **Step 4: Write the transform tests**

Add tests that use a four-column `fakeGrid`. The source is column zero and the destination is column two.

```ts
const source = { app: "cardmirror", token: "token-1", key: "doc|card" };

it("copies the exact run and moves only the destination tail", () => {
    const grid = fakeGrid(
        [
            ["tag", "neg-a", "dest-a", "neg-b"],
            [null, "neg-c", "dest-b", "neg-d"],
            ["warrant", null, "dest-c", null],
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, null],
        ],
        {
            "0,0": `${BOLD_CLASS} ${KICKED_CLASS}`,
            "1,0": GROUP_CLASS,
            "2,0": HIGHLIGHT_CLASS,
            "1,2": BOLD_CLASS,
        },
        { "0,0": source },
    );

    const changes = extendRun(grid, {
        sourceCol: gridCol(0),
        targetCol: gridCol(2),
        startRow: 0,
        height: 3,
    });
    grid.setDataAtCell(changes);

    expect(grid.col(0)).toEqual(["tag", null, "warrant", null, null, null]);
    expect(grid.col(1)).toEqual(["neg-a", "neg-c", null, null, null, null]);
    expect(grid.col(2)).toEqual(["tag", null, "warrant", "dest-a", "dest-b", "dest-c"]);
    expect(grid.col(3)).toEqual(["neg-b", "neg-d", null, null, null, null]);
    expect(grid.classNames["0,2"]).toBe(BOLD_CLASS);
    expect(grid.classNames["1,2"]).toBe(GROUP_CLASS);
    expect(grid.classNames["2,2"]).toBe(HIGHLIGHT_CLASS);
    expect(grid.sources["0,2"]).toEqual(source);
});

it("reports capacity that preserves an occupied destination tail", () => {
    const grid = fakeGrid([
        ["source", null, "a"],
        [null, null, "b"],
        [null, null, "c"],
    ]);
    expect(extensionRequiredRows(grid, gridCol(2), 0, 2)).toBe(5);
});
```

Also add one test where the last destination metadata is below its last text. This proves that capacity and shifting preserve metadata-only cells.

- [ ] **Step 5: Run the transform tests and observe the missing exports**

Run: `npm test -- test/lib/grid/extendCells.test.ts`

Expected: FAIL because `extensionRequiredRows` and `extendRun` do not exist.

- [ ] **Step 6: Implement capacity and transform logic**

Use the destination's last text or metadata row as its tail. Treat `null`, `undefined`, and `""` as blank text. Treat a non-empty class name or a `source` value as occupied metadata.

Before `shiftSpan`, snapshot every source row into local arrays. This prevents destination metadata writes from changing source reads.

`extendRun` must:

```ts
const copied = Array.from({ length: height }, (_, index) => {
    const row = startRow + index;
    const meta = grid.getCellMeta(row, sourceCol);
    return {
        text: grid.getDataAtCell(row, sourceCol) as string | null,
        className: ((meta.className ?? "") as string)
            .split(/\s+/)
            .filter((token) => token && token !== KICKED_CLASS)
            .join(" "),
        source: meta.source as CellSource | undefined,
    };
});
```

Then move the destination tail with `shiftSpan`. Write copied metadata to `startRow + index`. Return the shifted text changes followed by one copied text change per selected row.

`extensionRequiredRows` returns at least `grid.countRows()`. If the destination tail ends at `last`, it returns `Math.max(grid.countRows(), last + 1 + height)`.

- [ ] **Step 7: Run and format the grid helper tests**

Run: `npm test -- test/lib/grid/extendCells.test.ts`

Expected: PASS.

Run: `npm run format -- src/lib/grid/extendCells.ts test/lib/grid/extendCells.test.ts`

- [ ] **Step 8: Commit the grid helper**

```bash
git add src/lib/grid/extendCells.ts test/lib/grid/extendCells.test.ts
git commit -m "feat(grid): add argument extension transform"
```

---

### Task 2: Extend Command, Undo, and Collaboration

**Files:**
- Modify: `src/lib/commands/commands.ts:12-38,125-178,202-257`
- Modify: `test/lib/commands/commands.test.ts:1-22,318-467`
- Modify: `test/lib/commands/collabSeams.test.ts:1-97`

**Interfaces:**
- Consumes: all three exports from `src/lib/grid/extendCells.ts`.
- Produces: `runExtend(grid?: Handsontable): void`, exported so the context menu can supply its own grid.
- Produces: the `cell.extend` branch in `executeCommand`.

- [ ] **Step 1: Register the command identifier temporarily for compilation**

Add `| "cell.extend"` after `cell.move` in `CommandId`. Add the command definition and `EDITS_ROUND` entries:

```ts
"cell.extend": { id: "cell.extend", label: "Extend to next speech" },
```

Set `EDITS_ROUND["cell.extend"]` to `true`. Do not change the keymap in this task.

- [ ] **Step 2: Write failing command behavior tests**

Add an `extensionHot` test helper inside the `grid commands` describe block. The helper must expose a real mutable data array, `metaStore`, one selected range, `alter`, `setDataAtCell`, and `selectCells` spies.

The valid test uses a policy flow sheet with columns `1AC`, `1NC`, and `2AC`. Select rows zero through two in `1AC`. Seed content and metadata as follows:

```ts
const data = [
    ["tag", "neg-a", "dest-a"],
    [null, "neg-b", "dest-b"],
    ["warrant", null, null],
    [null, null, null],
    [null, null, null],
];
const meta = metaStore([
    ["0,0", { className: `${BOLD_CLASS} ${KICKED_CLASS}`, source }],
    ["1,0", { className: GROUP_CLASS }],
]);
```

Assert these observable results after `executeCommand("cell.extend")`:

```ts
expect(data.map((row) => row[2])).toEqual(["tag", null, "warrant", "dest-a", "dest-b"]);
expect(data.map((row) => row[0])).toEqual(["tag", null, "warrant", null, null]);
expect(meta.at(0, 2).className).toBe(BOLD_CLASS);
expect(meta.at(0, 2).source).toEqual(source);
expect(hot.selectCells).toHaveBeenCalledWith([[0, 2, 2, 2]]);
expect(onMutated).toHaveBeenCalledTimes(1);
```

Add refusal tests for multiple ranges, multiple columns, an all-blank run, CX, and the last same-side speech. Assert the exact toast text from the specification and assert that `setDataAtCell` did not run.

- [ ] **Step 3: Run the command tests and observe the missing command branch**

Run: `npm test -- test/lib/commands/commands.test.ts`

Expected: FAIL because `executeCommand("cell.extend")` does not change the grid.

- [ ] **Step 4: Implement `runExtend` validation and capacity**

Export a function with this shape:

```ts
export function runExtend(grid = getActiveHot()): void {
    if (!grid) return;
    const ranges = grid.getSelectedRange();
    if (!ranges || ranges.length === 0) return;
    if (ranges.length !== 1) {
        toast.error("Select cells in one speech to extend");
        return;
    }
    // Read the range corners, require one column, and validate non-empty text.
    // Get the active sheet and convert the grid column with toModelCol.
    // Reject CX, overflow, and a missing next same-side speech before mutation.
}
```

Use `columnsForFlowSheet(round, sheet)` for speech columns. Convert the destination model column back to a visual column with `toGridCol(modelCol(target), spacers)`.

Call `extensionRequiredRows` before the transform. If more rows are necessary, append only blank capacity:

```ts
if (required > grid.countRows()) {
    grid.alter("insert_row_below", grid.countRows() - 1, required - grid.countRows(), "auto");
}
```

Capture the destination metadata snapshot. Call `extendRun`, then submit one `setDataAtCell(changes, STRUCTURED_WRITE)`. Attach the after snapshot, render, call `notifyGridMutated`, and select the destination range.

Wrap only the capacity and transform application in `try/catch`. Validation errors use their exact messages. An application failure uses `toast.error("Could not extend this argument")` and must not call `notifyGridMutated` or `selectCells`.

Add `case "cell.extend": runExtend(); return;` beside the other cell commands.

- [ ] **Step 5: Add the focused undo and redo component test**

Use a real Handsontable instance in `test/components/flow/HotGrid.test.tsx`. Import
`executeCommand` and add this behavior test beside the other real-grid command tests:

```tsx
it("undoes and redoes one complete extension with metadata", async () => {
    const round = makeFlowRound();
    const sheet = round.sheets.find((candidate) => candidate.kind !== "cx")!;
    sheet.data = [
        ["tag", "neg", "destination"],
        ["warrant", null, null],
        [null, null, null],
        [null, null, null],
    ];
    sheet.meta = {
        "0,0": { bold: true, kicked: true, source: SRC },
        "0,2": { highlight: true },
    };
    useFlowStore.setState({
        round,
        activeSheetId: sheet.id,
        splitSheetId: null,
        alignSpeeches: false,
    });
    render(<HotGrid sheetId={sheet.id} pane={1} />);
    const hot = await mounted();
    hot.selectCells([[0, 0, 1, 0]]);

    act(() => executeCommand("cell.extend"));
    expect(hot.getDataAtCell(0, 2)).toBe("tag");
    expect(hot.getDataAtCell(2, 2)).toBe("destination");
    expect(hot.getCellMeta(0, 2).className).toBe("flow-bold");

    act(() => executeCommand("edit.undo"));
    expect(hot.getDataAtCell(0, 2)).toBe("destination");
    expect(hot.getCellMeta(0, 2).className).toBe("flow-highlight");

    act(() => executeCommand("edit.redo"));
    expect(hot.getDataAtCell(0, 2)).toBe("tag");
    expect(hot.getDataAtCell(2, 2)).toBe("destination");
    expect(hot.getCellMeta(0, 2).className).toBe("flow-bold");
});
```

Do not assert the internal undo-stack length. The observable contract is one complete state transition per undo or redo.

- [ ] **Step 6: Run the command and HotGrid tests**

Run: `npm test -- test/lib/commands/commands.test.ts test/components/flow/HotGrid.test.tsx`

Expected: PASS.

- [ ] **Step 7: Write the failing collaboration seam test**

Extend `test/lib/commands/collabSeams.test.ts` with a real stored policy sheet and a fake grid that mutates its data and metadata. Seed the replica through the existing `loadRound` path.

After `executeCommand("cell.extend")`, project `getReplica()` and assert:

```ts
expect(projected.data.map((row) => row[2])).toEqual(["perm", "cap bad", "extend", null]);
expect(projected.data.map((row) => row[1])).toEqual(["link", "turn", null, null]);
```

Also assert the copied metadata in the projected destination cell. This positive control proves that the structured write reached the replica.

- [ ] **Step 8: Run the collaboration test and observe replica drift**

Run: `npm test -- test/lib/commands/collabSeams.test.ts`

Expected: FAIL because `runExtend` does not record extension operations yet.

- [ ] **Step 9: Record structural collaboration operations**

After `notifyGridMutated`, record `height` `insertCell` operations at the same destination model row. Then read the updated sheet from `useFlowStore.getState().round` and record one `cellText` operation per copied row.

Record `cellMeta` for every copied row with non-empty metadata. Use `{}` for no metadata only when clearing a pre-existing destination value is necessary. The inserted ranks start blank, so rows without metadata need no metadata operation.

Keep `STRUCTURED_WRITE` excluded from `afterChange` replication. This command describes itself at its call site.

- [ ] **Step 10: Run and format the command tests**

Run: `npm test -- test/lib/commands/commands.test.ts test/lib/commands/collabSeams.test.ts test/components/flow/HotGrid.test.tsx`

Expected: PASS.

Run: `npm run format -- src/lib/commands/commands.ts src/lib/commands/registry.ts test/lib/commands/commands.test.ts test/lib/commands/collabSeams.test.ts test/components/flow/HotGrid.test.tsx`

- [ ] **Step 11: Commit the command behavior**

```bash
git add src/lib/commands/commands.ts src/lib/commands/registry.ts test/lib/commands/commands.test.ts test/lib/commands/collabSeams.test.ts test/components/flow/HotGrid.test.tsx
git commit -m "feat(editor): extend arguments to the next speech"
```

---

### Task 3: Keymap, Context Menu, and Cheatsheet

**Files:**
- Modify: `src/lib/keymap/presets.ts:15-54`
- Modify: `test/lib/keymap/presets.test.ts:20-33`
- Modify: `src/lib/keymap/reserved.ts:19-77`
- Modify: `src/lib/grid/contextMenu.ts:13-53`
- Modify: `test/lib/grid/contextMenu.test.ts:1-87`
- Modify: `src/components/palette/KeybindingsCheatsheet.tsx:55-72`

**Interfaces:**
- Consumes: `runExtend(grid?: Handsontable): void` from `@/lib/commands/commands`.
- Produces: `EXTEND_ITEM` in `src/lib/grid/contextMenu.ts`.
- Produces: the Mod+E preset binding for `cell.extend`.

- [ ] **Step 1: Write the failing keymap test**

Add this test to `test/lib/keymap/presets.test.ts`:

```ts
it("binds modifier+e to Extend and leaves Jump to source unbound", () => {
    expect(FLAT_KEYMAP.bindings[`${mod}+e`]).toBe("cell.extend");
    expect(Object.values(FLAT_KEYMAP.bindings)).not.toContain("cell.jumpToSource");
    expect(FLAT_KEYMAP.bindings[`${mod}+E`]).toBe("cell.sendToDoc");
});
```

- [ ] **Step 2: Run the keymap test and observe the previous binding**

Run: `npm test -- test/lib/keymap/presets.test.ts`

Expected: FAIL because Mod+E resolves to `cell.jumpToSource`.

- [ ] **Step 3: Reassign Mod+E**

In `LETTER_BINDINGS`, replace the unshifted Jump-to-source binding:

```ts
[`${mod}+e`]: "cell.extend",
[`${mod}+E`]: "cell.sendToDoc",
```

Keep `"e"` in `RESERVED_KEYS`, but change its comment to `extend argument`. Do not add a retired default. Existing config files store explicit user choices, and `cell.jumpToSource` must not silently lose a user-selected override.

- [ ] **Step 4: Write the failing context-menu tests**

Mock `runExtend` before the context-menu import:

```ts
const { runExtend } = vi.hoisted(() => ({ runExtend: vi.fn() }));
vi.mock("@/lib/commands/commands", () => ({ runExtend }));
```

Add these tests:

```ts
it("offers Extend for the selected flow cell", () => {
    expect(openOver(1, 1)).toContain("Extend to next speech");
});

it("hands Extend the grid that opened the menu", () => {
    hot.selectCell(0, 0);
    hot.getPlugin("contextMenu").executeCommand("extend_to_next_speech");
    expect(runExtend).toHaveBeenCalledWith(hot);
});
```

Reset `runExtend` in `beforeEach`. This test proves that split-view context menus do not substitute the singleton grid.

- [ ] **Step 5: Run the context-menu test and observe the missing item**

Run: `npm test -- test/lib/grid/contextMenu.test.ts`

Expected: FAIL because `extend_to_next_speech` is not registered.

- [ ] **Step 6: Implement the context-menu item**

Add this item:

```ts
export const EXTEND_ITEM = {
    key: "extend_to_next_speech",
    name: "Extend to next speech",
    callback(this: Handsontable): void {
        runExtend(this);
    },
};
```

Import the Handsontable type and `runExtend`. Put the item after `remove_row`, followed by the separator and conditional Jump-to-source item.

The context menu is already disabled for viewers by `HotGrid`, so this item needs no second viewer gate.

- [ ] **Step 7: Add Extend to the cheatsheet**

Add `{ commandId: "cell.extend" as CommandId }` to the grid formatting/action group near Toggle kicked. The cheatsheet reads the effective keymap, so it displays the Mod+E assignment without new display logic.

- [ ] **Step 8: Run and format command-surface tests**

Run: `npm test -- test/lib/keymap/presets.test.ts test/lib/grid/contextMenu.test.ts test/lib/commands/commands.test.ts test/components/settings/SettingsPanel.test.tsx`

Expected: PASS.

Run: `npm run format -- src/lib/keymap/presets.ts src/lib/keymap/reserved.ts src/lib/grid/contextMenu.ts test/lib/keymap/presets.test.ts test/lib/grid/contextMenu.test.ts src/components/palette/KeybindingsCheatsheet.tsx`

- [ ] **Step 9: Commit the command surfaces**

```bash
git add src/lib/keymap/presets.ts src/lib/keymap/reserved.ts src/lib/grid/contextMenu.ts test/lib/keymap/presets.test.ts test/lib/grid/contextMenu.test.ts src/components/palette/KeybindingsCheatsheet.tsx
git commit -m "feat(keymap): bind argument extension to Mod+E"
```

---

### Task 4: Full Verification and Browser Smoke Check

**Files:**
- Modify only files that fail the required verification because of this feature.
- Do not add snapshot tests or source-text assertions.

**Interfaces:**
- Consumes: the completed `cell.extend` feature.
- Produces: verification evidence for the implemented feature.

- [ ] **Step 1: Run the focused behavior tests**

Run:

```bash
npm test -- test/lib/grid/extendCells.test.ts test/lib/commands/commands.test.ts test/lib/commands/collabSeams.test.ts test/lib/keymap/presets.test.ts test/lib/grid/contextMenu.test.ts test/components/flow/HotGrid.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run all repository gates**

Run:

```bash
npm test
npm run lint
npm run format:check
```

Expected: all commands exit with status zero.

- [ ] **Step 3: Start the real web application**

Run `npm run dev` through the harness process manager. Wait for port 1280.

Open the application in Chromium. Create a Policy flow and open its first flow sheet.

- [ ] **Step 4: Exercise Extend in the real grid**

Put a three-row run in 1AC. Leave the middle source row blank. Apply bold, group, and kicked formatting, and put existing text in the corresponding 2AC rows.

Select the complete 1AC run and push Mod+E. Confirm these results visually:

- The copy appears in 2AC at the same starting row.
- Existing 2AC text moves down by three rows.
- 1NC does not move.
- The destination selection covers the copied run.
- Bold and group formatting remain visible.
- The copied run has no kicked slash.

- [ ] **Step 5: Exercise undo, redo, and invalid targets**

Push Mod+Z once. Confirm that the copy disappears and the former 2AC tail returns with its metadata.

Push Mod+Shift+Z once. Confirm that the copied run and shifted tail return.

Select a multi-column range and push Mod+E. Confirm the corner message `Select cells in one speech to extend` and no grid change.

Select the final same-side speech and push Mod+E. Confirm the corner message `No later speech for this side` and no grid change.

Open the keyboard cheatsheet and confirm that Extend shows Mod+E.

- [ ] **Step 6: Stop the development server and inspect cleanup**

Stop the process through the harness process manager. Remove no permanent tests. Remove temporary logging or smoke-only code if present.

- [ ] **Step 7: Commit verification fixes only when necessary**

If verification finds a source defect, return to the task that owns that behavior. Add a regression test, apply the fix, rerun that task's focused tests, and commit the exact corrected files.

If verification requires no changes, do not create an empty commit.
