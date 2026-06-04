# Debate Flow — Foundation (Phase 1) Design Spec

**Date:** 2026-06-01 **Status:** Approved for planning **Scope:** Phase 1 of a multi-phase product.
This spec covers _only_ the core flowing engine and UI. Later phases (drop/win intelligence
surfacing, live transcription assist, speech builder, collaboration, cross-applications) are
designed to layer on top and are out of scope here except where Phase 1 must not preclude them.

---

## 1. Vision & Product Frame

An app to revolutionize how competitive debaters flow rounds and debate off the flow. Primary
formats: **policy** and, by extension, **Lincoln–Douglas**. The long-term product includes novel,
"wow" capabilities (live transcription-assisted flowing, exact drop/clash detection, win-condition
tracking, speech-off-the-flow generation). Those are _later phases_.

Phase 1's job is to be a **genuinely excellent flowing app on its own** — fast enough to flow a
live, spread round on a laptop — while its data model and architecture are shaped so the later
intelligence and audio features plug in cleanly.

### Product constraints (hard requirements)

- **Shippable-product quality.** Strangers could pick it up. Polished, not a prototype.
- **Local-first, no accounts, no server-side data.** All round data lives on the user's machine
  (IndexedDB). No login, no backend persistence. Portability happens via file export/import.
- **Laptop web app, keyboard-first.** Desktop browser; optimized for fast typing and keyboard
  navigation during live rounds. Not tablet/touch.
- **Light mode only** for now (themeable architecture, but a single shipped theme).

---

## 2. Roles

A round is flowed from one of three perspectives, chosen at setup:

- **Aff** (debater on the affirmative)
- **Neg** (debater on the negative)
- **Judge** (flows both sides)

Role affects setup and the round header:

- Aff/Neg: header reads e.g. `Aff vs Westwood KS`.
- Judge: setup captures **both team names**; header reads e.g.
  `Westwood KS (Aff) vs Greenhill (Neg)`.

For Phase 1, the Judge role is primarily a setup + header difference (and the natural ability to
flow both sides). Decision/RFD support arrives with the later win-condition phase, which this spec
must not preclude.

---

## 3. Formats

Speech columns are **data**, not code: a format is an ordered list of speeches, each with a `name`
and a `time` (mm:ss). No per-format engine.

- Ships with two presets:
  - **Policy:** `1AC, 1NC, 2AC, 2NC, 1NR, 1AR, 2NR, 2AR` (the 2NC + 1NR "neg block" is
    grouped/labeled in rendering; see §5).
  - **LD:** `AC, NC, 1AR, NR, 2AR`.
- Columns are **lightly editable** at the round level (rename, adjust time, add/remove) so variants
  and oddball formats work without new code.
- "LD is automatically supported" because it is just a second preset over the same engine.

Prep time is configured per format (per-side prep clock; see §8).

---

## 4. Sheets & Round Structure

A **Round** contains many **Sheets**. One sheet per position:

- **Case sheets** — one per advantage, per solvency contention, etc.
- **Off-case sheets** — one per DA / CP / K / T / theory shell.

UI:

- Left **sidebar** lists all sheets, grouped **Case** and **Off-case**, in user order.
- Each sheet entry can show a **drop badge** (e.g. "1 drop") computed from its clash tree.
- Navigation: **fuzzy quick-switch** (default ⌘K), **index jump** (⌘1–9), **new sheet** (⌘N —
  prompts for name, files under the chosen group).

Every sheet shares the round's format (the same speech columns), though any given sheet typically
has content in only some columns.

---

## 5. The Flow — Core Data Model & Rendering

This is the heart of Phase 1.

### 5.1 Rendering: the elastic grid

Each sheet renders as a grid:

- **Columns = speeches** (from the format).
- **Rows = clash threads.** A parent argument visually aligns beside its first answer and **spans**
  its descendant answers (rowspan-style). Multiple answers to one argument **stack as sibling
  rows**.
- The grid is **elastic**: adding an answer / inserting an argument inserts a node and the grid
  reflows. It is never a fixed pre-sized table.

### 5.2 Underlying model: the clash tree

Although it renders as a grid, the underlying structure is a **clash tree**:

- Every cell is an **argument node**, belonging to one speech column on one sheet, at a free
  vertical position.
- A node has an **optional `parent`** = the argument it answers (a node in an earlier column).
- **Numbering** = a node's index among its **siblings under the same parent**, with support for
  manual **break points / restart**. (The 2AC's answers to a given 1NC argument number 1, 2, 3…
  _because_ they are children of that node.)
- **Drop detection** = a node whose expected responder created no child is flagged dropped. Exact
  and automatic where links exist.

### 5.3 The tree is an assist, never a cage (critical principle)

Freeform placement is paramount — the flow must never get in the user's way.

- The canvas is fundamentally a **freeform columnar surface**: place an argument anywhere, in any
  column, at any height; leave blank space; write a top-of-column overview; etc.
- The clash link (`parent`) is **optional metadata**: suggested by position, always editable, freely
  detachable/re-linkable.
- Numbering and drop-detection operate on **whatever links exist** and **degrade silently** when the
  user flows freeform (no links → no noise).
- **Manual placement and linking always override inference.**

### 5.4 Node contents & statuses

- A node holds shorthand text (multi-line allowed) and optional citation shorthand (e.g.,
  author-year captured inline).
- Statuses (Phase 1):
  - **Dropped** — auto-detected, shown as amber dashed indicator + sheet badge. Not hand-set.
  - **Conceded** — user-set (green).
  - **Extended / key** — user-set (green highlight).
  - (No strength flag in Phase 1.)

---

## 6. Interaction Model (Keyboard-First)

Spreadsheet-modal interaction with **vim defaults**, and **every binding fully remappable**.

### 6.1 Command registry + keymap

- All actions are **named commands** in a registry.
- The **keymap is data**: bindings map keys → command names, stored locally, editable in a settings
  UI.
- Ships with presets: **Vim (default)**, **Excel/arrow**, **Basic**. Users can rebind any command to
  any key.

### 6.2 Default (Vim) bindings — illustrative, all remappable

- **Move:** `h / j / k / l` between cells. `⌘←→↑↓` jump by column / to column ends.
- **Edit:** `Enter` or `i` enters a cell (insert mode); `Esc` exits to normal mode. `Shift+Enter` =
  soft line break within a cell.
- **Build (fluid clash):** one keystroke each for _add another answer_ (sibling under same parent),
  _answer the answer_ (child in next column), _insert argument above/below_. Grid reflows on insert.
- **Statuses:** chord to toggle Conceded / Extended on the selected node.
- **Sheets:** `⌘K` quick-switch, `⌘1–9` index jump, `⌘N` new sheet.
- **Timers:** start/stop active speech clock; start/stop prep — bound to avoid clobbering plain
  typing.
- Current **row highlights across all columns** so the active clash line is always visible. Selected
  cell shows a violet outline.

---

## 7. Colors (Reserved Palette)

Light theme. **Blue = Aff and red = Neg, reserved — used for nothing else.**

- Side shows as **text color + a thin left edge**; **cell backgrounds stay neutral** (full-cell
  tints were rejected for readability).
- Because speech columns alternate sides, the clash reads as alternating blue↔red across each row.
- Tones: Aff `#1d4ed8`, Neg `#c0271f`.
- Non-side semantics: **selection = violet `#7c3aed`**, **drop/warning = amber `#b45309`**,
  **conceded/extended = green `#047857`**, chrome = grays.

---

## 8. Timers

- **Speech clock** driven by the active speech's configured time (per format).
- **Per-side prep clocks** that count down each side's remaining prep for the round.
- On-screen controls plus customizable keyboard shortcuts. Timer state is part of the round.

---

## 9. Persistence & Portability

- **Storage:** Dexie over **IndexedDB** holds rounds; **autosave** on change (debounced). App
  settings (keymap, preferences) in **localStorage**.
- **Offline-capable:** as a local-first client app it keeps working without network (no lost flow
  mid-round if wifi drops).
- **Export/import:** **JSON** round files for backup and transfer between machines (the substitute
  for accounts/sync).
- **Print:** clean **printable / PDF** view of a sheet or whole round for coach review.

---

## 10. Tech Stack & Architecture

- **Next.js (App Router) + TypeScript.** Built as a client-side app (no accounts/server data);
  suitable for static export so it can run as a pure client / offline.
- **State:** Zustand.
- **Persistence:** Dexie (IndexedDB) + localStorage for settings.
- **Rendering:** custom grid component (not a generic data-grid — the elastic-clash layout is
  bespoke).

### Module boundaries (each independently understandable/testable)

- **`model/`** — clash-tree data types + pure operations (insert node, set parent, renumber
  siblings, detect drops). No UI. This is the seam later phases (intelligence, transcription) write
  into.
- **`format/`** — format presets and the speech-column list type.
- **`commands/`** — the command registry; pure command handlers operating on model/store.
- **`keymap/`** — keymap data, presets, key→command resolution, settings UI.
- **`store/`** — Zustand store wiring model ops + persistence (autosave).
- **`persistence/`** — Dexie schema, JSON export/import, print/PDF.
- **`ui/`** — round header, sidebar, the grid renderer, timers, settings.

The **`model/` seam** is the key forward-compatibility decision: drop/win intelligence and
transcription placement are future consumers of the same clash-tree operations.

---

## 11. Success Criteria (Phase 1)

1. A user can set up a round (role, format, opponent/teams) and create/organize Case and Off-case
   sheets.
2. A user can flow a full round on one sheet **fast, keyboard-only**, with vim defaults, and rebind
   any key.
3. The elastic grid renders parent-spanning clash with **parent-scoped numbering** and break points.
4. **Drops are auto-detected** and surfaced (cell indicator + sheet badge) where links exist, and
   stay silent when flowing freeform.
5. **Freeform placement** is never blocked by the tree; manual links override inference.
6. Reserved blue/red side colors render readably in light mode per §7.
7. Speech + prep **timers** work.
8. Rounds **autosave**, survive reload/offline, and round-trip through **JSON export/import**;
   sheets/rounds **print to PDF**.
9. LD works purely by selecting the LD format preset.

---

## 12. Out of Scope (Phase 1)

Cross-applications; intelligence surfacing beyond basic drop detection (win-condition tracker,
strategy advice); live transcription/audio; speech-off-the-flow builder; prep copilot;
collaboration/partner-sync; flow replay; accounts/sync; dark mode; non-laptop platforms; formats
beyond Policy/LD presets (though custom columns are supported).
