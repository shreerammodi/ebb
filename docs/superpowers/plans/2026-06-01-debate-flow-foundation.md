# Debate Flow — Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, local-first, keyboard-first Next.js web app for flowing competitive
debate rounds — the foundation phase of Debate Flow.

**Architecture:** A pure **clash-tree** model (argument nodes with optional parents) lives in
`src/lib/model`, with no UI dependencies — this is the seam later phases consume. A Zustand store
wires model operations to React and to debounced Dexie/IndexedDB autosave. The UI renders the tree
as an **elastic grid** (columns = speeches, rows = clash threads, parent spans its answers).
Keyboard interaction is a command-registry + remappable keymap with vim defaults and a normal/insert
modal model.

**Tech Stack:** Next.js (App Router) + TypeScript, Zustand, Dexie (IndexedDB), Vitest +
@testing-library/react for tests. Static-export friendly (pure client app). Light mode only.

**Reference:** Spec at `docs/superpowers/specs/2026-06-01-debate-flow-foundation-design.md`.

---

## File Structure

```
package.json, tsconfig.json, next.config.mjs, vitest.config.ts, .eslintrc.json
src/
  app/
    layout.tsx              # root layout (light theme)
    page.tsx                # client entry: setup vs workspace
    globals.css             # design tokens, reserved colors, grid styles
  lib/
    model/
      ids.ts                # uid generator
      types.ts             # Round, Sheet, ArgumentNode, Format, Speech, Role, NodeStatus
      tree.ts              # pure tree ops (insert/move/delete/link/children/order)
      numbering.ts         # sibling numbering + break points
      drops.ts             # drop detection
    format/
      presets.ts           # POLICY, LD presets + helpers
    store/
      useRoundStore.ts     # Zustand store: state + actions + selectors
    persistence/
      db.ts                # Dexie schema
      autosave.ts          # debounced persist subscription + load
      io.ts                # JSON export/import
    commands/
      registry.ts          # CommandId enum + metadata
      commands.ts          # command implementations (operate on store)
    keymap/
      types.ts             # Keymap, Binding, Mode
      presets.ts           # vim / excel / basic keymaps
      resolve.ts           # KeyboardEvent -> CommandId
      useKeymap.ts         # hook: global keydown -> dispatch, mode state
  components/
    RoundSetup.tsx          # setup screen
    Workspace.tsx           # header + sidebar + grid + timers shell
    RoundHeader.tsx         # side/teams + metadata + timer readout
    Sidebar.tsx             # grouped sheet list + drop badges
    QuickSwitcher.tsx       # ⌘K fuzzy sheet switch
    FlowGrid.tsx            # elastic grid renderer
    GridCell.tsx            # single node cell (display/edit/status)
    Timers.tsx              # speech + prep clocks
    SettingsPanel.tsx       # keymap customization
    PrintView.tsx           # print/PDF layout
```

---

## Conventions

- **TDD for `src/lib` (pure logic).** Write failing test, run, implement, run, commit.
- **UI tasks**: build component, add a focused render/interaction test where valuable, verify
  `npm run build` + `npm test` pass, commit.
- Commit after every task with `feat:`/`test:`/`chore:` prefixes.
- Run `npm test` and `npm run build` before each commit in UI tasks; `npm test` for lib tasks.

---

## Task 1: Scaffold the Next.js app + tooling

**Files:** Create `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`,
`.eslintrc.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
`src/lib/model/ids.ts`, `src/lib/model/ids.test.ts`.

- [ ] **Step 1:** Create a Next.js App Router project (TypeScript, `src/` dir, no Tailwind — we use
      plain CSS tokens). Configure `next.config.mjs` with `output: 'export'` and
      `images.unoptimized: true` for static client build. Add deps: `zustand`, `dexie`. Dev deps:
      `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`,
      `@testing-library/user-event`, `@testing-library/jest-dom`.
- [ ] **Step 2:** Configure `vitest.config.ts` with `jsdom` environment, React plugin, globals, and
      a setup file importing `@testing-library/jest-dom`. Add `"test": "vitest run"`,
      `"test:watch": "vitest"`, `"dev"`, `"build"` scripts.
- [ ] **Step 3:** Minimal `layout.tsx` (html/body, imports globals.css, lang=en, title "Debate
      Flow") and `page.tsx` (a `'use client'` placeholder rendering "Debate Flow"). `globals.css`
      with the design tokens from the spec §7 as CSS variables
      (`--aff:#1d4ed8; --neg:#c0271f; --sel:#7c3aed; --warn:#b45309; --good:#047857;` plus neutrals,
      fonts, light surface).
- [ ] **Step 4 (TDD seed):** `ids.ts` exports `uid(prefix?: string): string` (e.g.
      `prefix_<base36 time>_<random>`). Test in `ids.test.ts`: two calls produce different ids; id
      starts with prefix when given.
- [ ] **Step 5:** Run `npm test` (ids test passes) and `npm run build` (succeeds). Commit
      `chore: scaffold Next.js app, tooling, design tokens`.

---

## Task 2: Model types

**Files:** Create `src/lib/model/types.ts`.

- [ ] **Step 1:** Define and export:
  - `Role = 'aff' | 'neg' | 'judge'`
  - `Side = 'aff' | 'neg'`
  - `NodeStatus = 'conceded' | 'extended'` (a node has `statuses: NodeStatus[]`)
  - `Speech { id: string; name: string; side: Side; seconds: number; group?: string }` (`group` lets
    2NC/1NR share a "Neg block" label)
  - `Format { id: string; name: string; speeches: Speech[]; prepSeconds: { aff: number; neg: number } }`
  - `ArgumentNode { id: string; sheetId: string; speechId: string; parentId: string | null; order: number; text: string; statuses: NodeStatus[]; numberOverride?: number | null }`
    (`order` = vertical order key within a (sheet, speech) column)
  - `Sheet { id: string; title: string; group: 'case' | 'offcase'; order: number }`
  - `Round { id: string; createdAt: number; updatedAt: number; role: Role; format: Format; topic?: string; meta: { tournament?: string; roundLabel?: string; judge?: string; affName?: string; negName?: string; opponent?: string; }; sheets: Sheet[]; nodes: ArgumentNode[]; timers: TimerState; }`
  - `TimerState { activeSpeechId: string | null; speechRemaining: number | null; running: boolean; prepRemaining: { aff: number; neg: number }; prepRunning: Side | null; }`
- [ ] **Step 2:** No tests (pure types). `npm run build` passes. Commit
      `feat(model): core domain types`.

---

## Task 3: Clash-tree pure operations (TDD)

**Files:** Create `src/lib/model/tree.test.ts`, `src/lib/model/tree.ts`. Operate on arrays of
`ArgumentNode` (immutable; return new arrays).

- [ ] **Step 1 — failing tests** in `tree.test.ts` covering:
  - `childrenOf(nodes, parentId, sheetId)` returns children sorted by `order`.
  - `rootsOf(nodes, sheetId, speechId)` returns nodes with `parentId === null` in that column sorted
    by order.
  - `addNode(nodes, { sheetId, speechId, parentId, text })` appends a node with a unique id and
    `order` after existing siblings; returns `{ nodes, node }`.
  - `setParent(nodes, nodeId, parentId)` updates parentId (and resets numberOverride to null).
  - `updateText(nodes, nodeId, text)` updates text.
  - `toggleStatus(nodes, nodeId, status)` adds/removes a status.
  - `removeNode(nodes, nodeId)` removes the node and re-parents its children to the removed node's
    parent (so deleting an answer doesn't orphan sub-answers).
  - `moveNode(nodes, nodeId, newOrder)` reorders within its column.
- [ ] **Step 2:** Run `npx vitest run src/lib/model/tree.test.ts` — expect FAIL (functions
      undefined).
- [ ] **Step 3:** Implement `tree.ts` with the above as pure functions (use `uid('node')` from ids).
- [ ] **Step 4:** Run the test file — expect PASS.
- [ ] **Step 5:** Commit `feat(model): clash-tree operations`.

---

## Task 4: Sibling numbering with break points (TDD)

**Files:** Create `src/lib/model/numbering.test.ts`, `src/lib/model/numbering.ts`.

- [ ] **Step 1 — failing tests:**
  - `numberFor(nodes, nodeId)` returns the 1-based index of a node among siblings with the same
    `parentId` in the same `(sheetId, speechId)` column, ordered by `order`. First child → 1, second
    → 2.
  - Respects `numberOverride`: if set, returns it and subsequent siblings continue from there (break
    point / restart). E.g. siblings with overrides `[null, 5, null]` → `[1, 5, 6]`.
  - Returns `null` for a root node that has no parent AND no siblings sharing a parent (i.e.,
    numbering only applies to responses; top-level original arguments are unnumbered) — define: a
    node whose `parentId === null` returns `null`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `numbering.ts`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(model): parent-scoped numbering with break points`.

---

## Task 5: Drop detection (TDD)

**Files:** Create `src/lib/model/drops.test.ts`, `src/lib/model/drops.ts`.

Definition: a node is **dropped** when (a) it has at least one child somewhere earlier establishing
it's part of live clash, and (b) the _next speech by the opposing side_ (per the format's speech
order) introduced **no child** answering it, while the round has progressed past that speech (i.e.,
that speech has any content on the sheet). Keep the rule simple and testable:

- A node `n` in speech `S` (side X) is **dropped** if there exists a later speech `S2` of the
  opposing side that **has at least one node on the same sheet** (so the speech "happened"), AND no
  node in `S2` has `parentId === n.id`.
- Only applies to nodes that are themselves answers or original args that got answered — but for v1
  keep it: any node with `parentId === null` OR any answered node is eligible; a node with no
  children is "unanswered", flagged only if a subsequent opposing speech exists on the sheet.

- [ ] **Step 1 — failing tests** using a small fixture (POLICY speeches): build nodes where 2AC
      answers a 1NC arg with #1..#3; neg block answers #1 and #2 but not #3; assert
      `detectDrops(nodes, format, sheetId)` returns a set/array containing #3's id and not #1/#2.
      Assert that if the neg block has no nodes at all on the sheet, nothing is flagged (speech
      hasn't happened). Assert a freeform node with no parent and no later opposing content is not
      flagged.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `drops.ts`: `detectDrops(nodes, format, sheetId): string[]` (ids of
      dropped nodes) and `dropCountForSheet(...)`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(model): drop detection`.

---

## Task 6: Format presets

**Files:** Create `src/lib/format/presets.ts`, `src/lib/format/presets.test.ts`.

- [ ] **Step 1 — failing tests:** `POLICY` has speeches in order `1AC,1NC,2AC,2NC,1NR,1AR,2NR,2AR`
      with correct sides (`1AC`=aff,…) and `2NC`/`1NR` share `group:'Neg block'`. `LD` has
      `AC,NC,1AR,NR,2AR` with sides aff,neg,aff,neg,aff. `makeFormat(preset)` returns a fresh
      `Format` with unique speech ids. Prep: POLICY `{aff:480,neg:480}` (8m), LD `{aff:240,neg:240}`
      (4m).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement presets + `makeFormat`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(format): Policy and LD presets`.

---

## Task 7: Zustand store

**Files:** Create `src/lib/store/useRoundStore.ts`, `src/lib/store/useRoundStore.test.ts`.

- [ ] **Step 1 — failing tests** (use the store's vanilla API / `getState`):
  - `createRound({ role, format, meta })` sets `round` with empty sheets/nodes and initialized
    timers.
  - `addSheet({ title, group })` appends a sheet; `activeSheetId` set to it if first.
  - `addNode({ sheetId, speechId, parentId, text })` adds a node via tree ops and updates
    `round.updatedAt`.
  - `updateNodeText`, `toggleNodeStatus`, `setNodeParent`, `removeNode`, `moveNode` delegate to tree
    ops.
  - `setActiveSheet`, `renameSheet`, `reorderSheet`.
  - selector helpers exported as plain functions: `selectSheetNodes(state, sheetId)`,
    `selectDrops(state, sheetId)`, `selectSheetDropCount`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement store with `create` from zustand; actions call model ops; keep state
      minimal (`round`, `activeSheetId`, `mode: 'normal'|'insert'`,
      `selection: {sheetId, speechId, nodeId}|null`).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(store): round store with model-backed actions`.

---

## Task 8: Dexie persistence + autosave

**Files:** Create `src/lib/persistence/db.ts`, `src/lib/persistence/autosave.ts`,
`src/lib/persistence/autosave.test.ts`.

- [ ] **Step 1 — failing test** (fake-indexeddb): `saveRound(round)` then `loadRound(id)`
      round-trips deep equal; `listRounds()` returns summaries; `deleteRound(id)` removes it. Add
      dev dep `fake-indexeddb` and import in the test.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `db.ts` (Dexie DB `debateflow`, table `rounds` keyed by `id`, plus
      `meta` table for settings if needed). `autosave.ts`: `persistRound`, `loadRound`,
      `listRounds`, `deleteRound`, and `attachAutosave(store)` — subscribes to store changes,
      debounced 400ms, writes `round` when it changes. `loadLastRound()` helper.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(persistence): Dexie storage + debounced autosave`.

---

## Task 9: JSON export/import

**Files:** Create `src/lib/persistence/io.ts`, `src/lib/persistence/io.test.ts`.

- [ ] **Step 1 — failing tests:** `exportRoundJSON(round)` returns a string with a `version` field
      and the round. `importRoundJSON(string)` parses and validates shape, returns a `Round` (throws
      on bad/unknown version). Round-trip equality.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement with a `FILE_VERSION = 1`. Include `downloadRoundFile(round)` and
      `readRoundFile(file: File)` browser helpers (guard `document`/`FileReader` usage; pure parse
      function is separately testable).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(persistence): JSON export/import`.

---

## Task 10: Design system / globals.css

**Files:** Modify `src/app/globals.css`.

- [ ] **Step 1:** Flesh out tokens + base styles: light surface
      (`--bg:#f6f7f9; --panel:#fff; --ink:#1f2328; --muted:#6b7280; --line:#e5e7eb`), reserved side
      colors, status colors, font stack, focus-visible styles. Add utility classes for the grid
      (`.flow`, `.flow td/th`, `.side-aff`, `.side-neg`, `.cell-sel`, `.cell-drop`, `.badge-drop`,
      `.status-good`) matching the approved light mockup (`light-mode.html`).
- [ ] **Step 2:** `npm run build` passes. Commit `feat(ui): design tokens and grid styles`.

---

## Task 11: FlowGrid + GridCell rendering

**Files:** Create `src/components/FlowGrid.tsx`, `src/components/GridCell.tsx`,
`src/components/FlowGrid.test.tsx`.

- [ ] **Step 1 — failing test:** render `FlowGrid` with a fixture round + sheet that has a 1NC arg
      with three 2AC children and a block answering two; assert: column headers show speech names
      with side classes; the parent cell spans its children rows; numbered children render
      `1.`,`2.`,`3.`; the dropped child cell has the drop class/badge; the selected cell has the
      selection class.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. FlowGrid computes, per sheet: for each speech column the roots; lays
      the tree out into grid rows so a parent spans its descendant answer rows (compute rowspans by
      counting leaf rows under each node). Use side classes by `speech.side`. GridCell renders text
      or an editable input when `mode==='insert' && selection.nodeId===node.id`, the `numberFor`
      prefix, status badges, and drop badge. Group adjacent same-`group` speeches under a shared
      header label.
- [ ] **Step 4:** Run — PASS; `npm run build` passes.
- [ ] **Step 5:** Commit `feat(ui): elastic flow grid renderer`.

---

## Task 12: Command registry + keymap + modal keyboard

**Files:** Create `src/lib/commands/registry.ts`, `src/lib/commands/commands.ts`,
`src/lib/keymap/types.ts`, `src/lib/keymap/presets.ts`, `src/lib/keymap/resolve.ts`,
`src/lib/keymap/useKeymap.ts`, plus `src/lib/keymap/resolve.test.ts`,
`src/lib/commands/commands.test.ts`.

- [ ] **Step 1 — failing tests:**
  - `resolve.test.ts`: `resolveBinding(keymap, mode, event)` maps `{key:'j'}` in normal mode (vim) →
    `move.down`; `{key:'i'}` → `edit.enter`; `{key:'Escape'}` in insert → `edit.exit`;
    `{key:'k', meta:true}` → `sheet.quickSwitch`.
  - `commands.test.ts`: invoking `move.down` on a store moves selection to the node below;
    `node.addAnswerSibling` adds a sibling child under the same parent; `node.answerAcross` creates
    a child in the next opposing speech column; `arg.insertBelow` inserts a root arg;
    `status.toggleConceded` toggles; `sheet.next`/`sheet.prev` change active sheet.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: `registry.ts` lists `CommandId`s with label + default-mode metadata.
      `commands.ts` maps each id → `(store)=>void`. `keymap/types.ts` defines
      `Keymap = Record<Mode, Record<CommandId, KeyChord[]>>` (or chord→command map). `presets.ts`:
      VIM (hjkl, i/Enter edit, Esc exit, `o` add sibling answer, `a` answer across, `O`/`A` insert
      arg above/below, `c` conceded, `e` extended, ⌘K/⌘1-9/⌘N sheets, timer keys), EXCEL
      (arrows/Tab/Enter), BASIC. `resolve.ts` matches a normalized chord. `useKeymap.ts`: window
      keydown listener → resolve → dispatch command; tracks nothing itself (mode lives in store).
      Guard so typing in an input only matches insert-mode commands (Esc, etc.).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(keymap): command registry, vim/excel/basic keymaps, modal input`.

---

## Task 13: RoundSetup screen

**Files:** Create `src/components/RoundSetup.tsx`, `src/components/RoundSetup.test.tsx`.

- [ ] **Step 1 — failing test:** renders role choices (Aff/Neg/Judge) and format choices
      (Policy/LD); when Judge is selected, shows two team-name fields; when Aff/Neg, shows opponent
      field; submitting calls `createRound` with correct payload and a couple of starter sheets
      (e.g., a blank "Case" and lets user add off-case). Use user-event.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the setup form (role, format preset, topic, names/opponent,
      tournament/round/judge optional). On submit: `createRound`, seed one Case sheet, set active.
- [ ] **Step 4:** Run — PASS; build passes.
- [ ] **Step 5:** Commit `feat(ui): round setup screen with roles and formats`.

---

## Task 14: Workspace shell — header, sidebar, quick switcher

**Files:** Create `src/components/Workspace.tsx`, `src/components/RoundHeader.tsx`,
`src/components/Sidebar.tsx`, `src/components/QuickSwitcher.tsx`, tests `Sidebar.test.tsx`,
`RoundHeader.test.tsx`.

- [ ] **Step 1 — failing tests:** Header shows `Aff vs <opponent>` for aff role, and
      `<aff> (Aff) vs <neg> (Neg)` for judge role. Sidebar lists sheets grouped Case/Off-case, shows
      a drop badge when a sheet has drops, and clicking a sheet sets it active; `+ add sheet` adds
      one.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Workspace composes header + sidebar + FlowGrid + Timers and mounts
      `useKeymap`. QuickSwitcher: a modal opened by `sheet.quickSwitch` command, fuzzy-filters
      sheets, Enter selects.
- [ ] **Step 4:** Run — PASS; build passes.
- [ ] **Step 5:** Commit `feat(ui): workspace shell, header, sidebar, quick switcher`.

---

## Task 15: Timers (speech + prep)

**Files:** Create `src/components/Timers.tsx`, `src/lib/store` timer actions (extend store),
`src/components/Timers.test.tsx`.

- [ ] **Step 1 — failing tests:** store timer actions: `startSpeech(speechId)` sets active +
      remaining=speech.seconds + running; `tickSpeech()` decrements; `startPrep(side)`/`stopPrep()`
      manage prep countdown. Timers component renders mm:ss for active speech and both prep clocks;
      start/stop buttons call actions.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement timer slice + component (drive a 1s interval in the component via
      `useEffect` calling tick; format mm:ss). Wire timer keymap commands (`timer.toggleSpeech`,
      `timer.togglePrepAff`, `timer.togglePrepNeg`).
- [ ] **Step 4:** Run — PASS; build passes.
- [ ] **Step 5:** Commit `feat(ui): speech and prep timers`.

---

## Task 16: App wiring + autosave/load on boot

**Files:** Modify `src/app/page.tsx`; create `src/components/AppRoot.tsx`.

- [ ] **Step 1:** `AppRoot` (`'use client'`): on mount, attach autosave and try `loadLastRound()`.
      If a round exists → Workspace; else → RoundSetup. `page.tsx` renders `AppRoot`. Add an "New
      round" affordance in the header to start over (keeps old round in storage; switch active).
- [ ] **Step 2:** Add a light integration test: render AppRoot with no stored round → setup shows;
      after createRound via setup → workspace shows. (Mock persistence with fake-indexeddb.)
- [ ] **Step 3:** Run tests + `npm run build`. Commit
      `feat(app): boot flow, autosave attach, last-round restore`.

---

## Task 17: Keymap settings panel

**Files:** Create `src/components/SettingsPanel.tsx`, store settings slice (active keymap +
overrides persisted to localStorage), `src/components/SettingsPanel.test.tsx`.

- [ ] **Step 1 — failing test:** panel lists commands with their current binding; selecting a preset
      (Vim/Excel/Basic) changes active keymap; "record" a new chord for a command updates the
      override; overrides persist to localStorage and reload.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement settings slice (`keymapName`, `overrides`), `effectiveKeymap()` selector
      merging preset + overrides, localStorage persistence, and the panel UI (open via
      `app.openSettings` command / header button). A chord recorder captures the next keydown.
- [ ] **Step 4:** Run — PASS; build passes.
- [ ] **Step 5:** Commit `feat(settings): customizable keybindings panel`.

---

## Task 18: Print / PDF view + export/import UI

**Files:** Create `src/components/PrintView.tsx`; add export/import buttons to header.

- [ ] **Step 1:** `PrintView` renders all sheets as static grids with print CSS (`@media print`) so
      `window.print()` produces a clean PDF. Header gets: Export (calls `downloadRoundFile`), Import
      (file input → `readRoundFile` → load), Print (route to print view + `window.print()`).
- [ ] **Step 2:** Render test: PrintView shows every sheet title and its nodes. Verify build.
- [ ] **Step 3:** Commit `feat(ui): print/PDF view and export-import controls`.

---

## Task 19: Final polish + verification pass

**Files:** various.

- [ ] **Step 1:** Manual run (`npm run dev`): create a Policy round as Neg, add a Politics DA sheet,
      flow 1NC→2AC→block→1AR with vim keys, confirm numbering, a drop badge, conceded/extended
      marks, timers, quick-switch, export→import round-trip, print preview, reload restores. Fix
      issues found.
- [ ] **Step 2:** Run full `npm test` and `npm run build`; ensure both green. Address lint.
- [ ] **Step 3:** Update `README.md` with run/build/test instructions and a feature summary. Commit
      `docs: README + final polish`.

---

## Self-Review Notes

- **Spec coverage:** roles (T13/14), formats+LD (T6,13), sheets/grouping/badges (T7,14), elastic
  grid + clash tree + numbering + freeform (T2–4,11), drop detection (T5,11,14), vim+remappable
  keymap (T12,17), reserved light colors (T10,11), statuses conceded/extended (T2,3,11), timers
  (T15), persistence/autosave/JSON/print/offline (T8,9,16,18). Cross-apps + later-phase items
  intentionally excluded per spec §12.
- **Freeform principle:** enforced by allowing `parentId:null` nodes anywhere and numbering/drops
  degrading silently (T4,T5 tests cover the null/no-content cases).
