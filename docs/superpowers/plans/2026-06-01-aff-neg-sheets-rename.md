# Aff/Neg Sheets & Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename sidebar groups from Case/Off-case to Aff/Neg with dedicated `Meta+a`/`Meta+n` creation hotkeys, and add inline sheet renaming via double-click or `Meta+r` / vim `g r`.

**Architecture:** Three coordinated layers: (1) `Sheet.group` type rename `'case'|'offcase'` → `'aff'|'neg'` with IndexedDB v2 migration; (2) new commands `sheet.newAff`, `sheet.newNeg`, `sheet.rename` replacing `sheet.new`, wired into keymaps; (3) Sidebar UI with two-button footer and `SheetRow` inline rename input, plus a two-key chord accumulator in `useKeymap`.

**Tech Stack:** TypeScript, React, Zustand, Dexie/IndexedDB, Vitest + Testing Library, fake-indexeddb

---

## File Map

| File | Change |
|---|---|
| `src/lib/model/types.ts` | `Sheet.group` literal type `'case'\|'offcase'` → `'aff'\|'neg'` |
| `src/lib/store/useRoundStore.ts` | `addSheet` + `selectSheetsByGroup` signatures; add `renamingSheetId: string\|null` state + `setRenamingSheet` action |
| `src/lib/persistence/db.ts` | Add `version(2).upgrade()` migrating `case→aff`, `offcase→neg` in every stored round |
| `src/lib/commands/registry.ts` | Remove `sheet.new`; add `sheet.newAff`, `sheet.newNeg`, `sheet.rename` |
| `src/lib/commands/commands.ts` | Remove `sheet.new` case; add `sheet.newAff`, `sheet.newNeg`, `sheet.rename` cases |
| `src/lib/keymap/presets.ts` | COMMON\_NORMAL: replace `Meta+n→sheet.new` with `Meta+n→sheet.newNeg`; add `Meta+a→sheet.newAff`, `Meta+r→sheet.rename`; VIM\_KEYMAP normal: add `'g r'→sheet.rename` |
| `src/lib/keymap/useKeymap.ts` | Add module-level `pendingPrefix` accumulator; handle two-key chord sequences |
| `src/components/Sidebar.tsx` | `GroupConfig` type + GROUPS config; two-button `+ Aff`/`+ Neg` footer; `SheetRow` inline rename input |
| `src/components/RoundSetup.tsx` | Bootstrap sheet `group: 'aff'` (was `'case'`) |
| `src/components/KeybindingsCheatsheet.tsx` | Replace `sheet.new` row with `sheet.newAff`, `sheet.newNeg`, `sheet.rename` |
| **All test files** | Bulk replace `group: 'case'` → `group: 'aff'`, `group: 'offcase'` → `group: 'neg'`, `'offcase'` selectors → `'neg'` |

---

### Task 1: Rename Sheet.group type and fix all callsites

This is a pervasive type rename. All production and test callsites must move together — TypeScript will fail to compile until they do. No new "failing test" step: the existing tests become the failing tests the moment you change `types.ts` alone.

**Files:**
- Modify: `src/lib/model/types.ts:50-51`
- Modify: `src/lib/store/useRoundStore.ts:42,499`
- Modify: `src/lib/commands/commands.ts:178`
- Modify: `src/components/Sidebar.tsx:16,21-22,63`
- Modify: `src/components/RoundSetup.tsx:55`
- Modify (tests, bulk): `src/lib/store/useRoundStore.test.ts`, `src/components/Sidebar.test.tsx`, `src/lib/commands/commands.test.ts`, `src/lib/persistence/autosave.test.ts`, `src/lib/keymap/useKeymap.test.tsx`, `src/components/FlowGrid.test.tsx`, `src/lib/persistence/io.test.ts`

- [ ] **Step 1: Update `types.ts`**

Replace lines 46–53:

```typescript
/** A flow sheet (page) grouping arguments. */
export interface Sheet {
  id: string;
  title: string;
  group: 'aff' | 'neg';
  /** Display order among sheets. */
  order: number;
}
```

- [ ] **Step 2: Update `useRoundStore.ts` signatures**

Line 42 — change `addSheet` signature:
```typescript
addSheet(input: { title: string; group: 'aff' | 'neg' }): string;
```

Line 499 — change `selectSheetsByGroup` signature:
```typescript
export function selectSheetsByGroup(
  round: Round | null,
  group: 'aff' | 'neg',
): Sheet[] {
```

- [ ] **Step 3: Update `commands.ts` line 178 (temporary — removed in Task 5)**

```typescript
case 'sheet.new': {
  if (!round) return;
  const newSheetId = state.addSheet({ title: 'Untitled', group: 'neg' });
  state.setActiveSheet(newSheetId);
  return;
}
```

- [ ] **Step 4: Update `Sidebar.tsx` type + GROUPS config**

`GroupConfig` interface (line 16):
```typescript
interface GroupConfig {
  group: 'aff' | 'neg';
  label: string;
}
```

`GROUPS` array (lines 20–23):
```typescript
const GROUPS: GroupConfig[] = [
  { group: 'aff', label: 'Aff' },
  { group: 'neg', label: 'Neg' },
];
```

Footer button (line 63) — temporary, will be replaced in Task 7:
```typescript
onClick={() => addSheet({ title: 'Untitled', group: 'neg' })}
```

- [ ] **Step 5: Update `RoundSetup.tsx` line 55**

```typescript
addSheet({ title: 'Aff', group: 'aff' });
```

- [ ] **Step 6: Bulk-replace all test callsites**

Run these sed commands (or use global find-and-replace in your editor):

```bash
# useRoundStore.test.ts
sed -i '' \
  "s/group: 'case'/group: 'aff'/g;
   s/group: 'offcase'/group: 'neg'/g;
   s/selectSheetsByGroup(round, 'offcase')/selectSheetsByGroup(round, 'neg')/g;
   s/s\.group === 'offcase'/s.group === 'neg'/g" \
  src/lib/store/useRoundStore.test.ts

# Sidebar.test.tsx
sed -i '' \
  "s/group: 'case'/group: 'aff'/g;
   s/group: 'offcase'/group: 'neg'/g;
   s/expect(newest\.group)\.toBe('offcase')/expect(newest.group).toBe('neg')/g" \
  src/components/Sidebar.test.tsx

# commands.test.ts
sed -i '' \
  "s/group: 'offcase'/group: 'neg'/g" \
  src/lib/commands/commands.test.ts

# autosave.test.ts
sed -i '' \
  "s/group: 'case'/group: 'aff'/g;
   s/group: 'offcase'/group: 'neg'/g" \
  src/lib/persistence/autosave.test.ts

# useKeymap.test.tsx
sed -i '' \
  "s/group: 'offcase'/group: 'neg'/g" \
  src/lib/keymap/useKeymap.test.tsx

# FlowGrid.test.tsx
sed -i '' \
  "s/group: 'case'/group: 'aff'/g;
   s/group: 'offcase'/group: 'neg'/g" \
  src/components/FlowGrid.test.tsx

# io.test.ts
sed -i '' \
  "s/group: 'case'/group: 'aff'/g;
   s/group: 'offcase'/group: 'neg'/g" \
  src/lib/persistence/io.test.ts
```

- [ ] **Step 7: Run all tests and verify they pass**

```bash
npx vitest run
```

Expected: all tests pass (same count as before — ~312).

- [ ] **Step 8: Commit**

```bash
git add src/lib/model/types.ts src/lib/store/useRoundStore.ts \
  src/lib/commands/commands.ts src/components/Sidebar.tsx \
  src/components/RoundSetup.tsx \
  src/lib/store/useRoundStore.test.ts src/components/Sidebar.test.tsx \
  src/lib/commands/commands.test.ts src/lib/persistence/autosave.test.ts \
  src/lib/keymap/useKeymap.test.tsx src/components/FlowGrid.test.tsx \
  src/lib/persistence/io.test.ts
git commit -m "refactor: rename Sheet.group case/offcase → aff/neg"
```

---

### Task 2: IndexedDB v2 migration

Stored rounds have `sheet.group` values of `'case'` and `'offcase'`. The v2 upgrade rewrites them in-place. This runs automatically on first open after the user updates.

**Files:**
- Modify: `src/lib/persistence/db.ts`
- Create: `src/lib/persistence/db.test.ts`

- [ ] **Step 1: Write the failing migration test**

Create `src/lib/persistence/db.test.ts`:

```typescript
/**
 * IMPORTANT: fake-indexeddb/auto MUST be imported first.
 */
import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';

describe('IndexedDB v1→v2 migration', () => {
  it('remaps case→aff and offcase→neg on all sheet groups', async () => {
    const DB_NAME = 'debateflow-migration-test';

    // Seed a v1 database with old group values.
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores({ rounds: 'id, updatedAt' });
    await v1.table('rounds').add({
      id: 'round_mig',
      createdAt: 1,
      updatedAt: 1,
      role: 'aff',
      format: { id: 'f', name: 'T', speeches: [], prepSeconds: { aff: 240, neg: 240 } },
      meta: {},
      nodes: [],
      timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 240, neg: 240 }, prepRunning: null },
      sheets: [
        { id: 'sh1', title: 'Case', group: 'case', order: 0 },
        { id: 'sh2', title: 'DA', group: 'offcase', order: 1 },
      ],
    });
    await v1.close();

    // Open at v2 with the same upgrade logic used in db.ts.
    const v2 = new Dexie(DB_NAME);
    v2.version(1).stores({ rounds: 'id, updatedAt' });
    v2.version(2).upgrade(tx =>
      tx.table('rounds').toCollection().modify((r: { sheets: Array<{ group: string }> }) => {
        r.sheets = r.sheets.map(s => ({
          ...s,
          group: s.group === 'case' ? 'aff' : s.group === 'offcase' ? 'neg' : s.group,
        }));
      }),
    );

    const migrated = await v2.table('rounds').get('round_mig') as { sheets: Array<{ group: string }> };
    expect(migrated.sheets[0].group).toBe('aff');
    expect(migrated.sheets[1].group).toBe('neg');
    await v2.close();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/persistence/db.test.ts
```

Expected: 1 test, FAIL (test creates v1 db, v2 opens it without upgrading because `db.ts` has no v2).

- [ ] **Step 3: Add version 2 upgrade to `db.ts`**

Replace the constructor body in `src/lib/persistence/db.ts`:

```typescript
class DebateFlowDB extends Dexie {
  rounds!: EntityTable<Round, 'id'>;

  constructor() {
    super('debateflow');
    this.version(1).stores({
      rounds: 'id, updatedAt',
    });
    this.version(2).upgrade(tx =>
      tx.table('rounds').toCollection().modify((r: { sheets: Array<{ group: string }> }) => {
        r.sheets = r.sheets.map(s => ({
          ...s,
          group: s.group === 'case' ? 'aff' : s.group === 'offcase' ? 'neg' : s.group,
        }));
      }),
    );
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/persistence/db.test.ts
```

Expected: 1 test, PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/persistence/db.ts src/lib/persistence/db.test.ts
git commit -m "feat(db): add v2 migration remapping case/offcase → aff/neg"
```

---

### Task 3: Command registry update

Remove `sheet.new`. Add `sheet.newAff`, `sheet.newNeg`, `sheet.rename`. Update the cheatsheet component to reference the new command IDs.

**Files:**
- Modify: `src/lib/commands/registry.ts`
- Modify: `src/components/KeybindingsCheatsheet.tsx`

No new test for the registry itself — it's a pure data declaration and TypeScript enforces correctness. Downstream tests for commands (Task 5) and keymaps (Task 6) will fail until those tasks are complete, so keep test runs scoped during this task.

- [ ] **Step 1: Update `registry.ts`**

Replace the `CommandId` type (lines 8–21):

```typescript
export type CommandId =
  | 'move.left' | 'move.down' | 'move.up' | 'move.right'
  | 'edit.enter' | 'edit.exit'
  | 'node.addAnswer' | 'node.answerAcross' | 'arg.newRoot'
  | 'node.delete'
  | 'status.toggleConceded' | 'status.toggleExtended'
  | 'sheet.next' | 'sheet.prev' | 'sheet.newAff' | 'sheet.newNeg' | 'sheet.rename' | 'sheet.quickSwitch'
  | 'sheet.jump1' | 'sheet.jump2' | 'sheet.jump3' | 'sheet.jump4' | 'sheet.jump5'
  | 'sheet.jump6' | 'sheet.jump7' | 'sheet.jump8' | 'sheet.jump9'
  | 'settings.open'
  | 'timer.toggleSpeech'
  | 'timer.togglePrepAff'
  | 'timer.togglePrepNeg'
  | 'help.open';
```

Replace the `COMMANDS` record — remove `sheet.new`, add the three new entries:

```typescript
export const COMMANDS: Record<CommandId, CommandDef> = {
  'move.left': { id: 'move.left', label: 'Move left (to parent)' },
  'move.down': { id: 'move.down', label: 'Move down' },
  'move.up': { id: 'move.up', label: 'Move up' },
  'move.right': { id: 'move.right', label: 'Move right (to child)' },
  'edit.enter': { id: 'edit.enter', label: 'Edit cell' },
  'edit.exit': { id: 'edit.exit', label: 'Exit edit' },
  'node.addAnswer': { id: 'node.addAnswer', label: 'Add answer (sibling)' },
  'node.answerAcross': { id: 'node.answerAcross', label: 'Answer across (next speech)' },
  'arg.newRoot': { id: 'arg.newRoot', label: 'New root argument' },
  'node.delete': { id: 'node.delete', label: 'Delete node' },
  'status.toggleConceded': { id: 'status.toggleConceded', label: 'Toggle conceded' },
  'status.toggleExtended': { id: 'status.toggleExtended', label: 'Toggle extended' },
  'sheet.next': { id: 'sheet.next', label: 'Next sheet' },
  'sheet.prev': { id: 'sheet.prev', label: 'Previous sheet' },
  'sheet.newAff': { id: 'sheet.newAff', label: 'New aff sheet' },
  'sheet.newNeg': { id: 'sheet.newNeg', label: 'New neg sheet' },
  'sheet.rename': { id: 'sheet.rename', label: 'Rename active sheet' },
  'sheet.quickSwitch': { id: 'sheet.quickSwitch', label: 'Quick switch sheet' },
  'sheet.jump1': { id: 'sheet.jump1', label: 'Jump to sheet 1' },
  'sheet.jump2': { id: 'sheet.jump2', label: 'Jump to sheet 2' },
  'sheet.jump3': { id: 'sheet.jump3', label: 'Jump to sheet 3' },
  'sheet.jump4': { id: 'sheet.jump4', label: 'Jump to sheet 4' },
  'sheet.jump5': { id: 'sheet.jump5', label: 'Jump to sheet 5' },
  'sheet.jump6': { id: 'sheet.jump6', label: 'Jump to sheet 6' },
  'sheet.jump7': { id: 'sheet.jump7', label: 'Jump to sheet 7' },
  'sheet.jump8': { id: 'sheet.jump8', label: 'Jump to sheet 8' },
  'sheet.jump9': { id: 'sheet.jump9', label: 'Jump to sheet 9' },
  'settings.open': { id: 'settings.open', label: 'Open settings' },
  'timer.toggleSpeech': { id: 'timer.toggleSpeech', label: 'Toggle speech timer' },
  'timer.togglePrepAff': { id: 'timer.togglePrepAff', label: 'Toggle aff prep timer' },
  'timer.togglePrepNeg': { id: 'timer.togglePrepNeg', label: 'Toggle neg prep timer' },
  'help.open': { id: 'help.open', label: 'Show keybindings' },
};
```

- [ ] **Step 2: Update `KeybindingsCheatsheet.tsx` — replace `sheet.new` in the GROUPS array**

Find the Sheets group (around line 44–51). Replace the `sheet.new` row with three new rows:

```typescript
  {
    label: 'Sheets',
    rows: [
      { commandId: 'sheet.prev' },
      { commandId: 'sheet.next' },
      { commandId: 'sheet.quickSwitch' },
      { commandId: 'sheet.newAff' },
      { commandId: 'sheet.newNeg' },
      { commandId: 'sheet.rename' },
      { commandId: 'sheet.jump1' },
```

(Leave the remaining jump rows and the rest of the file unchanged.)

- [ ] **Step 3: Check TypeScript only (tests will fail until Tasks 4–5)**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/commands/registry.ts src/components/KeybindingsCheatsheet.tsx
git commit -m "feat(registry): replace sheet.new with sheet.newAff/newNeg/rename"
```

---

### Task 4: Store rename state

Add `renamingSheetId` to the store's state shape and `setRenamingSheet` to its actions. This unblocks Task 5 (the rename command handler calls it).

**Files:**
- Modify: `src/lib/store/useRoundStore.ts`
- Modify: `src/lib/store/useRoundStore.test.ts` (add new describe block)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/store/useRoundStore.test.ts`:

```typescript
describe('renamingSheetId', () => {
  beforeEach(() => {
    useRoundStore.setState({ ...BLANK_STATE, renamingSheetId: null });
  });

  it('starts as null', () => {
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
  });

  it('setRenamingSheet sets the id', () => {
    useRoundStore.getState().setRenamingSheet('sheet_abc');
    expect(useRoundStore.getState().renamingSheetId).toBe('sheet_abc');
  });

  it('setRenamingSheet(null) clears the id', () => {
    useRoundStore.getState().setRenamingSheet('sheet_abc');
    useRoundStore.getState().setRenamingSheet(null);
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/store/useRoundStore.test.ts
```

Expected: FAIL — `renamingSheetId` does not exist on store state.

- [ ] **Step 3: Add state field to `RoundState` in `useRoundStore.ts`**

In the `RoundState` interface (around line 24–35), add:

```typescript
export interface RoundState {
  round: Round | null;
  activeSheetId: string | null;
  mode: 'normal' | 'insert';
  selection: { sheetId: string; speechId: string; nodeId: string } | null;
  keymapName: 'vim' | 'excel' | 'basic';
  keymapOverrides: Record<string, string>;
  quickSwitcherOpen: boolean;
  settingsOpen: boolean;
  cheatsheetOpen: boolean;
  renamingSheetId: string | null;
}
```

- [ ] **Step 4: Add action to `RoundActions` interface**

```typescript
export interface RoundActions {
  // ... existing actions ...
  setRenamingSheet(id: string | null): void;
  // ...
}
```

- [ ] **Step 5: Add initial value + implementation in the store factory**

In the initial state block (around line 120–128), add:

```typescript
  renamingSheetId: null,
```

After the existing `setCheatsheetOpen` implementation, add:

```typescript
  // ── setRenamingSheet ───────────────────────────────────────────────────────
  setRenamingSheet(id) {
    set({ renamingSheetId: id });
  },
```

- [ ] **Step 6: Run test — expect PASS**

```bash
npx vitest run src/lib/store/useRoundStore.test.ts
```

Expected: all pass (including new renamingSheetId describe block).

- [ ] **Step 7: Commit**

```bash
git add src/lib/store/useRoundStore.ts src/lib/store/useRoundStore.test.ts
git commit -m "feat(store): add renamingSheetId state and setRenamingSheet action"
```

---

### Task 5: Command handlers — newAff, newNeg, rename

Replace the `sheet.new` handler with three new handlers.

**Files:**
- Modify: `src/lib/commands/commands.ts`
- Modify: `src/lib/commands/commands.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/commands/commands.test.ts`:

```typescript
describe('sheet.newAff', () => {
  beforeEach(resetStore);

  it('adds an aff sheet, makes it active', () => {
    setupRound();
    const before = useRoundStore.getState().round!.sheets.length;
    executeCommand('sheet.newAff');
    const state = useRoundStore.getState();
    const sheets = state.round!.sheets;
    expect(sheets).toHaveLength(before + 1);
    const newest = sheets[sheets.length - 1];
    expect(newest.group).toBe('aff');
    expect(state.activeSheetId).toBe(newest.id);
  });

  it('no-ops when round is null', () => {
    executeCommand('sheet.newAff');
    expect(useRoundStore.getState().round).toBeNull();
  });
});

describe('sheet.newNeg', () => {
  beforeEach(resetStore);

  it('adds a neg sheet and makes it active', () => {
    setupRound();
    executeCommand('sheet.newNeg');
    const state = useRoundStore.getState();
    const newest = state.round!.sheets[state.round!.sheets.length - 1];
    expect(newest.group).toBe('neg');
    expect(state.activeSheetId).toBe(newest.id);
  });

  it('sets selection to the first neg speech', () => {
    setupRound();
    executeCommand('sheet.newNeg');
    const state = useRoundStore.getState();
    const fmt = state.round!.format;
    const firstNegSpeech = fmt.speeches.find(s => s.side === 'neg')!;
    const newest = state.round!.sheets[state.round!.sheets.length - 1];
    expect(state.selection).toEqual({
      sheetId: newest.id,
      speechId: firstNegSpeech.id,
      nodeId: '',
    });
  });

  it('no-ops when round is null', () => {
    executeCommand('sheet.newNeg');
    expect(useRoundStore.getState().round).toBeNull();
  });
});

describe('sheet.rename', () => {
  beforeEach(resetStore);

  it('sets renamingSheetId to the active sheet id', () => {
    const { sheetId } = setupRound();
    useRoundStore.getState().setActiveSheet(sheetId);
    executeCommand('sheet.rename');
    expect(useRoundStore.getState().renamingSheetId).toBe(sheetId);
  });

  it('no-ops when there is no active sheet', () => {
    setupRound();
    useRoundStore.setState({ activeSheetId: null });
    executeCommand('sheet.rename');
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/commands/commands.test.ts
```

Expected: new describe blocks FAIL — `sheet.newAff`, `sheet.newNeg`, `sheet.rename` cases not in switch.

- [ ] **Step 3: Update `commands.ts` — replace the `sheet.new` case, add three new cases**

Remove the entire `case 'sheet.new':` block (lines 176–181). Add the following three cases in its place:

```typescript
    case 'sheet.newAff': {
      if (!round) return;
      const newSheetId = state.addSheet({ title: 'Untitled', group: 'aff' });
      state.setActiveSheet(newSheetId);
      return;
    }

    case 'sheet.newNeg': {
      if (!round) return;
      const newSheetId = state.addSheet({ title: 'Untitled', group: 'neg' });
      state.setActiveSheet(newSheetId);
      const firstNegSpeech = round.format.speeches.find(s => s.side === 'neg');
      if (firstNegSpeech) {
        state.setSelection({ sheetId: newSheetId, speechId: firstNegSpeech.id, nodeId: '' });
      }
      return;
    }

    case 'sheet.rename': {
      const { activeSheetId } = state;
      if (!activeSheetId) return;
      state.setRenamingSheet(activeSheetId);
      return;
    }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/lib/commands/commands.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/commands/commands.ts src/lib/commands/commands.test.ts
git commit -m "feat(commands): add sheet.newAff, sheet.newNeg, sheet.rename handlers"
```

---

### Task 6: Keymap preset bindings

Wire the new commands into the keymap presets.

**Files:**
- Modify: `src/lib/keymap/presets.ts`
- Modify: `src/lib/keymap/effective.test.ts` (add new assertions)

- [ ] **Step 1: Write failing tests**

Append to `src/lib/keymap/effective.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { effectiveKeymap } from './effective';
```

(Check if the file already has these imports — if so, just append the describe block.)

```typescript
describe('COMMON_NORMAL bindings after aff/neg/rename additions', () => {
  it('Meta+a → sheet.newAff in all presets', () => {
    for (const name of ['vim', 'excel', 'basic'] as const) {
      const km = effectiveKeymap(name, {});
      expect(km.bindings.normal['Meta+a']).toBe('sheet.newAff');
    }
  });

  it('Meta+n → sheet.newNeg (not sheet.new) in all presets', () => {
    for (const name of ['vim', 'excel', 'basic'] as const) {
      const km = effectiveKeymap(name, {});
      expect(km.bindings.normal['Meta+n']).toBe('sheet.newNeg');
    }
  });

  it('Meta+r → sheet.rename in all presets', () => {
    for (const name of ['vim', 'excel', 'basic'] as const) {
      const km = effectiveKeymap(name, {});
      expect(km.bindings.normal['Meta+r']).toBe('sheet.rename');
    }
  });

  it('"g r" → sheet.rename in vim only', () => {
    const vim = effectiveKeymap('vim', {});
    expect(vim.bindings.normal['g r']).toBe('sheet.rename');
    const excel = effectiveKeymap('excel', {});
    expect(excel.bindings.normal['g r']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/keymap/effective.test.ts
```

Expected: new assertions FAIL.

- [ ] **Step 3: Update `presets.ts`**

In `COMMON_NORMAL`, replace the `'Meta+n': 'sheet.new'` entry and add two new ones:

```typescript
const COMMON_NORMAL: Record<Chord, CommandId> = {
  ']': 'sheet.next',
  '[': 'sheet.prev',
  'Meta+k': 'sheet.quickSwitch',
  'Meta+a': 'sheet.newAff',
  'Meta+n': 'sheet.newNeg',
  'Meta+r': 'sheet.rename',
  'Meta+,': 'settings.open',
  s: 'timer.toggleSpeech',
  p: 'timer.togglePrepAff',
  P: 'timer.togglePrepNeg',
  '?': 'help.open',
  ...SHEET_JUMPS,
};
```

In `VIM_KEYMAP`, add the two-key chord binding to the `normal` bindings:

```typescript
export const VIM_KEYMAP: Keymap = {
  name: 'vim',
  bindings: {
    normal: {
      h: 'move.left',
      j: 'move.down',
      k: 'move.up',
      l: 'move.right',
      i: 'edit.enter',
      Enter: 'edit.enter',
      o: 'node.addAnswer',
      a: 'node.answerAcross',
      O: 'arg.newRoot',
      c: 'status.toggleConceded',
      e: 'status.toggleExtended',
      x: 'node.delete',
      'g r': 'sheet.rename',
      ...COMMON_NORMAL,
    },
    insert: { ...INSERT_EXIT },
  },
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/lib/keymap/effective.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/keymap/presets.ts src/lib/keymap/effective.test.ts
git commit -m "feat(keymap): add Meta+a/Meta+n/Meta+r bindings and vim 'g r' chord"
```

---

### Task 7: Sidebar UI — two-button footer and SheetRow inline rename

Replace the single `+ Add sheet` button with `+ Aff` / `+ Neg`. Add inline rename to `SheetRow`.

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to the `describe('Sidebar', ...)` block in `Sidebar.test.tsx`:

```typescript
  it('shows "+ Aff" and "+ Neg" buttons, not "+ Add sheet"', () => {
    setupRound();
    render(<Sidebar />);
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(screen.getByTestId('add-aff')).toBeInTheDocument();
    expect(screen.getByTestId('add-neg')).toBeInTheDocument();
  });

  it('"+ Aff" button adds an aff sheet and makes it active', async () => {
    const user = userEvent.setup();
    setupRound();
    const beforeCount = useRoundStore.getState().round!.sheets.length;

    render(<Sidebar />);
    await user.click(screen.getByTestId('add-aff'));

    const state = useRoundStore.getState();
    const sheets = state.round!.sheets;
    expect(sheets).toHaveLength(beforeCount + 1);
    const newest = sheets[sheets.length - 1];
    expect(newest.group).toBe('aff');
    expect(state.activeSheetId).toBe(newest.id);
  });

  it('"+ Neg" button adds a neg sheet and makes it active', async () => {
    const user = userEvent.setup();
    setupRound();
    const beforeCount = useRoundStore.getState().round!.sheets.length;

    render(<Sidebar />);
    await user.click(screen.getByTestId('add-neg'));

    const state = useRoundStore.getState();
    const sheets = state.round!.sheets;
    expect(sheets).toHaveLength(beforeCount + 1);
    const newest = sheets[sheets.length - 1];
    expect(newest.group).toBe('neg');
    expect(state.activeSheetId).toBe(newest.id);
  });

  it('double-clicking a sheet title shows a rename input', async () => {
    const user = userEvent.setup();
    const { caseId } = setupRound();

    render(<Sidebar />);
    const sheetBtn = screen.getByTestId(`sheet-${caseId}`);
    await user.dblClick(sheetBtn);

    expect(screen.getByTestId(`rename-input-${caseId}`)).toBeInTheDocument();
  });

  it('pressing Enter in rename input commits the new name', async () => {
    const user = userEvent.setup();
    const { caseId } = setupRound();

    render(<Sidebar />);
    await user.dblClick(screen.getByTestId(`sheet-${caseId}`));

    const input = screen.getByTestId(`rename-input-${caseId}`);
    await user.clear(input);
    await user.type(input, 'New Name{Enter}');

    expect(useRoundStore.getState().round!.sheets.find(s => s.id === caseId)!.title).toBe('New Name');
    expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
  });

  it('pressing Escape in rename input cancels without renaming', async () => {
    const user = userEvent.setup();
    const { caseId } = setupRound();
    const originalTitle = useRoundStore.getState().round!.sheets.find(s => s.id === caseId)!.title;

    render(<Sidebar />);
    await user.dblClick(screen.getByTestId(`sheet-${caseId}`));

    const input = screen.getByTestId(`rename-input-${caseId}`);
    await user.clear(input);
    await user.type(input, 'Changed');
    await user.keyboard('{Escape}');

    expect(useRoundStore.getState().round!.sheets.find(s => s.id === caseId)!.title).toBe(originalTitle);
    expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
  });
```

Also update the existing test that checked for `'Off-case'` label (it's now `'Neg'`):

Find and replace in the test file:
```typescript
// old:
expect(screen.getByText('Off-case')).toBeInTheDocument();
// new:
expect(screen.getByText('Neg')).toBeInTheDocument();
```

And the test for `+ Add sheet` button (now replaced):
```typescript
// old test: '"+ Add sheet" button adds an off-case sheet'
// Replace the test body to check for new buttons (already covered by new tests above)
// Delete or update the old test body to not reference 'add-sheet' testid
```

Specifically, remove or replace the old `it('"+ Add sheet" button adds an off-case sheet', ...)` test entirely — the new tests cover this behavior.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: new tests FAIL, existing label test FAIL (still shows `'Off-case'`).

- [ ] **Step 3: Rewrite `Sidebar.tsx`**

Replace the full file content:

```typescript
'use client';

import { useRef, useState, useEffect } from 'react';
import { useRoundStore, selectSheetsByGroup, selectSheetDropCount } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import type { Sheet } from '@/lib/model/types';

interface GroupConfig {
  group: 'aff' | 'neg';
  label: string;
}

const GROUPS: GroupConfig[] = [
  { group: 'aff', label: 'Aff' },
  { group: 'neg', label: 'Neg' },
];

export default function Sidebar() {
  const round           = useRoundStore(s => s.round);
  const activeSheetId   = useRoundStore(s => s.activeSheetId);
  const setActiveSheet  = useRoundStore(s => s.setActiveSheet);
  const renamingSheetId = useRoundStore(s => s.renamingSheetId);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);

  if (!round) return null;

  return (
    <nav style={styles.sidebar} aria-label="Sheets" data-testid="sidebar" className="no-print">
      <div style={styles.scroll}>
        {GROUPS.map(({ group, label }) => {
          const sheets = selectSheetsByGroup(round, group);
          return (
            <div key={group} style={styles.group}>
              <div className="label" style={styles.groupHeader}>{label}</div>
              {sheets.length === 0 ? (
                <div className="muted" style={styles.empty}>No sheets</div>
              ) : (
                sheets.map(sheet => (
                  <SheetRow
                    key={sheet.id}
                    sheet={sheet}
                    dropCount={selectSheetDropCount(round, sheet.id)}
                    active={sheet.id === activeSheetId}
                    onSelect={() => setActiveSheet(sheet.id)}
                    isRenaming={sheet.id === renamingSheetId}
                    onStartRename={() => setRenamingSheet(sheet.id)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.addBtns}>
        <button
          type="button"
          className="btn"
          style={styles.addBtn}
          onClick={() => executeCommand('sheet.newAff')}
          data-testid="add-aff"
        >
          + Aff
        </button>
        <button
          type="button"
          className="btn"
          style={styles.addBtn}
          onClick={() => executeCommand('sheet.newNeg')}
          data-testid="add-neg"
        >
          + Neg
        </button>
      </div>
    </nav>
  );
}

// ─── Sheet row ────────────────────────────────────────────────────────────────

interface SheetRowProps {
  sheet: Sheet;
  dropCount: number;
  active: boolean;
  onSelect: () => void;
  isRenaming: boolean;
  onStartRename: () => void;
}

function SheetRow({ sheet, dropCount, active, onSelect, isRenaming, onStartRename }: SheetRowProps) {
  const renameSheet      = useRoundStore(s => s.renameSheet);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(sheet.title);

  useEffect(() => {
    if (isRenaming) {
      setValue(sheet.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, sheet.title]);

  function commit() {
    renameSheet(sheet.id, value.trim() || sheet.title);
    setRenamingSheet(null);
  }

  function cancel() {
    setRenamingSheet(null);
  }

  const rowStyle = {
    ...styles.sheetRow,
    ...(active ? styles.sheetRowActive : null),
  };

  if (isRenaming) {
    return (
      <div style={rowStyle}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.stopPropagation(); commit(); }
            if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
          }}
          onBlur={commit}
          style={styles.renameInput}
          data-testid={`rename-input-${sheet.id}`}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      aria-current={active ? 'true' : undefined}
      data-testid={`sheet-${sheet.id}`}
      style={rowStyle}
    >
      <span style={styles.sheetTitle}>{sheet.title}</span>
      {dropCount > 0 && (
        <span className="badge-drop" data-testid={`drop-badge-${sheet.id}`}>
          {dropCount}
        </span>
      )}
    </button>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  sidebar: {
    display:       'flex',
    flexDirection: 'column',
    width:         '220px',
    flex:          '0 0 220px',
    height:        '100%',
    background:    'var(--panel)',
    borderRight:   '1px solid var(--line)',
  } as React.CSSProperties,

  scroll: {
    flex:      '1 1 auto',
    overflowY: 'auto',
    padding:   '8px',
  } as React.CSSProperties,

  group: {
    marginBottom: '12px',
  } as React.CSSProperties,

  groupHeader: {
    padding: '6px 8px 4px',
  } as React.CSSProperties,

  empty: {
    padding:  '4px 8px',
    fontSize: '12px',
  } as React.CSSProperties,

  sheetRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            '6px',
    width:          '100%',
    textAlign:      'left',
    font:           'inherit',
    fontSize:       '13px',
    color:          'var(--ink)',
    background:     'transparent',
    border:         '1px solid transparent',
    borderRadius:   '6px',
    padding:        '6px 8px',
    cursor:         'pointer',
  } as React.CSSProperties,

  sheetRowActive: {
    background:  'var(--bg)',
    borderColor: 'var(--line)',
    fontWeight:  600,
  } as React.CSSProperties,

  sheetTitle: {
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  } as React.CSSProperties,

  renameInput: {
    flex:        '1 1 auto',
    font:        'inherit',
    fontSize:    '13px',
    color:       'var(--ink)',
    background:  'transparent',
    border:      'none',
    outline:     '1px solid var(--aff)',
    borderRadius:'3px',
    padding:     '0 2px',
    width:       '100%',
  } as React.CSSProperties,

  addBtns: {
    display: 'flex',
    gap:     '4px',
    margin:  '8px',
    flex:    '0 0 auto',
  } as React.CSSProperties,

  addBtn: {
    flex: '1 1 0',
  } as React.CSSProperties,
} as const;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat(sidebar): Aff/Neg buttons, inline sheet rename"
```

---

### Task 8: Two-key chord sequences in useKeymap

Add `pendingPrefix` accumulator so `g r` (vim) fires `sheet.rename`.

**Files:**
- Modify: `src/lib/keymap/useKeymap.ts`
- Modify: `src/lib/keymap/useKeymap.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/keymap/useKeymap.test.tsx`:

```typescript
describe('two-key chord sequences', () => {
  beforeEach(resetStore);

  function setupWithSheet() {
    const fmt = makeFormatByKey('policy');
    const store = useRoundStore.getState();
    store.createRound({ role: 'aff', format: fmt, meta: {} });
    const sheetId = useRoundStore.getState().addSheet({ title: 'Case', group: 'aff' });
    useRoundStore.setState({ activeSheetId: sheetId, renamingSheetId: null });
    return sheetId;
  }

  it('"g" then "r" fires sheet.rename (sets renamingSheetId)', () => {
    const sheetId = setupWithSheet();
    render(<Harness />);

    dispatchKey('g');
    expect(useRoundStore.getState().renamingSheetId).toBeNull(); // not yet

    dispatchKey('r');
    expect(useRoundStore.getState().renamingSheetId).toBe(sheetId);
  });

  it('"g" then an unbound key clears the prefix without firing', () => {
    setupWithSheet();
    render(<Harness />);

    dispatchKey('g');
    dispatchKey('x'); // 'g x' is not bound; 'x' alone is node.delete, no-ops (no selection)
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
  });

  it('"g" alone does not fire any command', () => {
    setupWithSheet();
    render(<Harness />);

    dispatchKey('g');
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
    // mode is unchanged
    expect(useRoundStore.getState().mode).toBe('normal');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/keymap/useKeymap.test.tsx
```

Expected: new tests FAIL — pressing `g` then `r` does not fire anything yet.

- [ ] **Step 3: Update `useKeymap.ts`**

Replace the full file content:

```typescript
'use client';

import { useEffect } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import { effectiveKeymap as computeEffectiveKeymap } from './effective';
import { resolveCommand, eventToChord } from './resolve';

/** Returns the keymap currently in effect: preset merged with user overrides. */
export function effectiveKeymap() {
  const { keymapName, keymapOverrides } = useRoundStore.getState();
  return computeEffectiveKeymap(keymapName, keymapOverrides);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

// Module-level accumulator — safe because useKeymap is a singleton hook.
let pendingPrefix: string | null = null;

export function useKeymap(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const keymap = effectiveKeymap();
      const { mode } = useRoundStore.getState();

      const editable = isEditableTarget(e.target);
      // In an editable field, only allow Escape (edit.exit) through.
      // Also clear any pending chord prefix so it doesn't get stuck.
      if (editable) {
        pendingPrefix = null;
        if (e.key !== 'Escape') return;
      }

      const chord = eventToChord({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey });
      const modeBindings = keymap.bindings[mode] ?? {};

      // ── Two-key chord resolution ─────────────────────────────────────────────
      if (pendingPrefix !== null) {
        const twoKey = `${pendingPrefix} ${chord}`;
        if (twoKey in modeBindings) {
          pendingPrefix = null;
          e.preventDefault();
          executeCommand(modeBindings[twoKey]);
          return;
        }
        // Prefix didn't complete — clear and fall through to single-chord lookup.
        pendingPrefix = null;
      }

      // Check whether this chord is a valid prefix for any two-key sequence.
      const isPrefix = Object.keys(modeBindings).some(k => k.startsWith(`${chord} `));
      if (isPrefix) {
        pendingPrefix = chord;
        e.preventDefault();
        return;
      }

      // ── Single-chord resolution ──────────────────────────────────────────────
      const commandId = resolveCommand(keymap, mode, {
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
      if (!commandId) return;

      e.preventDefault();
      executeCommand(commandId);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      pendingPrefix = null; // clear on unmount
    };
  }, []);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/lib/keymap/useKeymap.test.tsx
```

Expected: all pass, including the two new chord sequence tests.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/keymap/useKeymap.ts src/lib/keymap/useKeymap.test.tsx
git commit -m "feat(keymap): add two-key chord sequence support (pendingPrefix)"
```

---

## Self-Review Against Spec

### Spec coverage

| Spec requirement | Task |
|---|---|
| `Sheet.group` type `'aff'\|'neg'` | Task 1 |
| Sidebar GROUPS labels → Aff / Neg | Task 1 (type) + Task 7 (UI) |
| `RoundSetup` bootstrap `group: 'aff'` | Task 1 |
| `addSheet` / `selectSheetsByGroup` signature update | Task 1 |
| IndexedDB v2 migration `case→aff`, `offcase→neg` | Task 2 |
| Remove `sheet.new`, add `sheet.newAff` / `sheet.newNeg` / `sheet.rename` | Task 3 |
| `sheet.newAff` handler — create + activate | Task 5 |
| `sheet.newNeg` handler — create + activate + select first neg speech | Task 5 |
| `sheet.rename` handler — `setRenamingSheet(activeSheetId)` | Task 5 |
| `Meta+a → sheet.newAff` in COMMON\_NORMAL | Task 6 |
| `Meta+n → sheet.newNeg` (replaces `sheet.new`) | Task 6 |
| `Meta+r → sheet.rename` in COMMON\_NORMAL | Task 6 |
| `g r → sheet.rename` in VIM\_KEYMAP | Task 6 |
| `renamingSheetId` store state + `setRenamingSheet` action | Task 4 |
| Sidebar `+ Aff` / `+ Neg` footer buttons | Task 7 |
| `SheetRow` inline rename input (Enter commit, Escape cancel, blur commit) | Task 7 |
| Double-click title triggers rename | Task 7 |
| Auto-focus + select-all on rename start | Task 7 |
| Two-key chord accumulator in `useKeymap` | Task 8 |
| Escape in editable clears pending prefix | Task 8 |
| `KeybindingsCheatsheet` updated | Task 3 |

All spec sections covered.

### Placeholder scan

No TBDs, TODOs, or "similar to Task N" references found. All code blocks contain complete implementations.

### Type consistency

- `Sheet.group: 'aff' | 'neg'` — defined Task 1, used consistently in Tasks 1–7.
- `addSheet({ title, group: 'aff' | 'neg' })` — signature updated Task 1, called correctly in Tasks 5 + 7.
- `renamingSheetId: string | null` — added Task 4, read in Task 7 (`Sidebar`), written in Task 5 (`sheet.rename` handler).
- `setRenamingSheet(id: string | null)` — defined Task 4, called Task 5 + Task 7.
- `selectSheetsByGroup(round, 'aff' | 'neg')` — Task 1 signature, Task 7 usage.
- `sheet.newAff` / `sheet.newNeg` / `sheet.rename` CommandId — defined Task 3, implemented Task 5, bound Task 6, invoked Task 7.
- `pendingPrefix` — module-level in Task 8, cleared on editable target and on unmount.
