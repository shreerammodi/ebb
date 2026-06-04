# Flow UX Batch — Design

**Date:** 2026-06-03
**Status:** Approved pending user review
**Scope:** Six related UX/feature tasks on the live model (`Round` + `ArgumentNode[]` + `Sheet[]`). The `src/lib/editor/` Box-tree engine remains unwired and is out of scope here.

## Background

The live app stores a round as `Round { role, format, meta, topic?, sheets[], nodes: ArgumentNode[], timers }` in a zustand store (`useRoundStore`). `round` is replaced wholesale (immutably) on every mutation. UI: `RoundHeader` (top nav), `Sidebar` (sheet list), `FlowGrid` → `GridCell` (the flow table), `SettingsPanel` (keyboard-only modal), `RoundSetup` (create screen). Keymap settings already persist to `localStorage` (`df-keymap-settings`). The Excel template (`public/templates/Flow.xlsx`) defines an **Info** sheet (scouting) and a **CX** sheet whose structure we mirror.

## Tasks

### 1. Settings button in the nav

Add a gear-icon `Button` to `RoundHeader`'s right-hand `no-print` group, left of Import / New round, firing `executeCommand('settings.open')` (or `setSettingsOpen(true)`). No new state — `SettingsPanel` already opens on that flag. Add `data-testid="settings-btn"` and an `aria-label`.

### 2. Flow sheet aesthetics

In `FlowGrid` markup + `globals.css` (`table.flow` rules):

- Speech-name header cells and group-header cells: larger font size and `text-align: center`.
- **Empty cells no longer show `—`.** Today the empty `<td>` contains `<span class="dash">—</span>` which doubles as the click target. Replace with an empty (but still clickable) cell that holds its height via a `min-height` on the cell content so the full cell remains a click target to start a new argument. Selected-empty (`cell-sel`) styling unchanged. The `.dash` rule may be removed.

No model or behavior change; navigation and selection are untouched.

### 3. Display settings (auto-numbering, drop labeling)

Two global boolean preferences, persisted to `localStorage` under a new key `df-display-settings`, defaulting to `true`:

- `autoNumber` — show the `N.` prefix on arguments.
- `labelDrops` — show the `⚠ dropped` badge in cells and the drop count in the sidebar.

**Store:** add `autoNumber` / `labelDrops` to state with `setAutoNumber` / `setLabelDrops` actions that persist (mirror `saveKeymapSettings`). Load initial values SSR-safely like `loadKeymapSettings`.

**SettingsPanel:** add a "Display" section above the keymap preset/list with two switches (use the existing `ui` primitives / a simple toggle button) bound to these settings.

**GridCell:** read `autoNumber` (suppress the `arg-num` span when off) and `labelDrops` (suppress the `badge-drop` span when off). **Sidebar:** suppress the per-sheet drop badge when `labelDrops` is off.

Both toggles are **purely cosmetic** — tree structure, navigation, drop *detection*, and answer-attachment are unchanged; only rendering is gated.

### 4. Deletion + full undo/redo

**Undo engine (snapshot-based, store-level).** Because `round` is already replaced immutably on every mutation, snapshotting is cheap and correct.

- Add `past: Round[]` and `future: Round[]` to state.
- A private `commit(mutator)` helper (or equivalent wrapping in each content action) snapshots the *current* `round` onto `past`, applies the mutation, and clears `future`. Cap `past` length (~50; drop oldest).
- `undo()`: if `past` non-empty, push current `round` to `future`, pop `past` into `round`; reconcile `activeSheetId`/`selection` if they now point at something gone.
- `redo()`: symmetric.
- **Excluded from history:** timer ticks (`tickSpeech`/`tickPrep`/`startSpeech`/prep), `selection`, `mode`, and all UI flags. These must NOT go through `commit`.
- **Coalescing:** consecutive `updateNodeText` calls to the same `nodeId` collapse into one undo entry. Track a `coalesceKey` (e.g. `text:<nodeId>`); if the last commit shared the key, replace rather than push. Entering insert mode / selecting a different node / any non-text mutation ends the group.
- New commands `edit.undo` / `edit.redo` in the registry + handlers + default bindings (`Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z`), surfaced in `SettingsPanel`'s command list. Guard so undo/redo don't fire while a text input/textarea is focused and the browser's native undo is wanted — bindings only act in normal grid context (consistent with existing keymap gating).

**Delete cells:** already wired (`node.delete` → `removeNode`). Becomes undoable once `removeNode` routes through `commit`.

**Delete sheets:** add a hover-revealed `×` affordance to `SheetRow` (non-renaming state) calling `removeSheet(sheet.id)`. **Immediate delete, no confirm** — recoverable via undo. `removeSheet` already reconciles `activeSheetId`/`selection`; route it through `commit`. The pinned CX sheet (task 6) and — if present — Info are not deletable.

### 5. Scouting / Info menu

Mirror the Excel **Info** sheet and make it editable anytime.

**Model (`types.ts`):**

- Add `Scouting`:
  ```ts
  interface Debater { first: string; last: string }
  interface Decision { vote?: 'aff' | 'neg'; rfd?: string }
  interface Scouting {
    affSchool?: string; negSchool?: string;
    aff: { first: Debater; second: Debater };   // 1A, 2A
    neg: { first: Debater; second: Debater };   // 1N, 2N
    tournament?: string; round?: string; date?: string; judge?: string;
    decision?: Decision;
  }
  ```
- Add `scouting: Scouting` to `Round` (seeded empty by `createRound`).
- **Remove `topic`** from `Round`, `createRound`, `RoundSetup`, and any export references.

**Team codes (computed, not stored).** A pure helper `teamCode(school, first, second)` mirroring the template formula: `school + " " + initials`, where initials are the two debaters' **last-name** first letters in alphabetical order; with one debater, first+last initial of that debater. Used in the Info panel preview and exports.

**UI:**

- New **`InfoPanel`** component — same overlay/modal pattern as `SettingsPanel` — with all scouting fields editable, plus a live read-only preview of both generated team codes. Writes via a new `setScouting(partial)` store action (routed through `commit` so edits are undoable, coalesced per field).
- New **"Info" button** in `RoundHeader` nav (and an `info.open` command + `infoOpen` store flag, parallel to settings).
- **`RoundSetup` trimmed to role-only:** pick Aff / Neg / Judge and start. Format defaults to Policy (consistent with the policy-only project decision); the format picker, topic, opponent, names, tournament, round, judge fields are removed from this screen. All of that now lives in the Info panel.
- `RoundHeader`'s participant string derives from `scouting` (school/team codes) with sensible fallbacks, replacing the current `meta.opponent`/`affName`/`negName` read. `meta` may remain for now but scouting is the source of truth for participants; reconcile to avoid duplication.

**Export:** Excel populates the existing Info-sheet cells from `scouting` (schools, debater names, tournament/round/date/judge, decision); team-code cells already hold formulas and need only the inputs. JSON includes `scouting`; PDF header uses it. Drop `topic` from exports.

### 6. CX sheet

**Model:**

- Add `kind: 'flow' | 'cx'` to `Sheet` (optional / defaulting to `'flow'`; existing sheets without it treated as flow).
- Add `cx` to `Round`: four periods keyed `1AC` / `1NC` / `2AC` / `2NC`, each an ordered `Array<{ id: string; question: string; response: string }>`.
- `createRound` auto-creates one pinned CX sheet (`kind: 'cx'`) and seeds empty `cx`.

**Store:** actions `addCxRow(period)`, `updateCxRow(period, id, patch)`, `removeCxRow(period, id)` — all routed through `commit` (text edits coalesced like node text).

**UI:**

- **`CxSheet`** renderer (selected like any sheet via `activeSheetId`): four columns (`1AC CX`, `1NC CX`, `2AC CX`, `2NC CX`), each a vertical stack of Question/Response input pairs with an "add row" affordance. Its own component, **not** the flow grid.
- `Workspace` chooses `CxSheet` vs `FlowGrid` based on the active sheet's `kind`.
- **Sidebar:** the pinned CX sheet renders at the top of the list, above the Aff/Neg groups, and is not deletable/renamable.
- CX sheets are excluded from drop detection and from flow exports; included in Excel as the CX sheet (populate `Question`/`Response` cells per period).

### Task 6 — REVISED (2026-06-03, after first implementation)

User feedback superseded the bespoke `round.cx` + custom `CxSheet` approach. The CX sheet now **reuses the flow-grid engine**:

- **CX cells are real `ArgumentNode`s** on a fixed CX-specific column set (`CX_COLUMNS`), rendered through the same `FlowGrid`/`GridCell`. Navigation, edit, undo, and keymap all work identically. The `round.cx`/`CxData`/`CxRow`/`CxPeriod` model and `addCxRow`/`updateCxRow`/`removeCxRow` actions and the standalone `CxSheet` component are **removed**.
- `CX_COLUMNS` = 8 pseudo-speeches: for each period `1AC`/`1NC`/`2AC`/`2NC`, a `Question` column then a `Response` column, grouped by period (`group: '<period> CX'`). Stable ids (`cx-1ac-q`, `cx-1ac-r`, …). Side per column = questioner/answerer (Q = opponent of the named speech, R = the named speech's side), so colors alternate meaningfully.
- **Response is a child of its Question:** `answer across` from a Question cell creates the Response as a child in the paired Response column (reusing the existing rowspan grouping). move-right/left navigate Q↔R via the existing parent/child helpers.
- **No drop/extend/number on CX:** drop detection already ignores CX nodes (their `speechId` isn't in `format.speeches`); status toggles (`conceded`/`extended`) no-op on CX nodes; `GridCell` suppresses numbering + status badges on CX sheets.
- **Sidebar:** CX is its own labeled section ABOVE the Aff section (not a single pinned button).
- **Sheet cycling:** `sheet.next`/`prev`/`jump` operate on flow sheets only; CX is reached by clicking its section.
- **Excel CX export:** reads CX nodes (Question parent + Response child per period) instead of `round.cx`.

## Architecture notes

- **One foundational change set, then parallel work.** Model edits (`scouting`, `Sheet.kind`, `cx`, remove `topic`) and the undo engine both live in `types.ts` / `useRoundStore.ts`; doing them first avoids merge conflicts. After that, UI polish (1/2/3), Info (5), and CX (6) are largely independent.
- **Undo correctness hinges on routing every content mutation — and only content mutations — through `commit`.** A checklist of store actions (in/out) belongs in the implementation plan, with tests asserting timer ticks and selection do not create undo entries and that text-edit coalescing holds.
- **Persistence:** `scouting`, `cx`, and `Sheet.kind` are new round fields and flow through Dexie autosave and JSON import/export automatically. Imported older rounds lacking these fields must be normalized on load (default `kind: 'flow'`, empty `scouting`/`cx`, synthesize a CX sheet if missing) — handle in the load/import path.

## Testing

- **Display settings:** GridCell hides number/badge when toggles off; sidebar hides drop count; settings persist to localStorage.
- **Undo/redo:** delete cell → undo restores it; delete sheet → undo restores it and its nodes; text edits coalesce into single undo steps; timer ticks and selection changes create no undo entries; redo replays; depth cap holds.
- **Aesthetics:** empty cells render no `—` yet remain clickable to start an argument; headers centered.
- **Scouting:** `teamCode` helper (alphabetical last-initial ordering, single-debater fallback, empty inputs); InfoPanel edits persist and are undoable; `topic` fully removed; participant string derives from scouting.
- **CX:** add/edit/remove rows per period; CxSheet vs FlowGrid selection by kind; CX sheet pinned and non-deletable; excluded from drop detection.
- **Export:** Excel Info + CX cells populated; JSON round-trips new fields; normalization of legacy imports.
