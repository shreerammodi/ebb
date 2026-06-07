# Flows Dashboard — Design

**Date:** 2026-06-06
**Status:** Approved (brainstormed + grilled)

## Summary

Add a **Flows Dashboard** as the app's new landing screen. It presents every
flow the user has created as a grid of compact "mini info-sheet" cards
summarizing each round's scouting, with fuzzy search across all flow content,
sort + group-by-tournament organization, per-flow and bulk import/export,
soft-delete to a Trash view, and access to the existing Settings panel.

This replaces today's behavior where `AppRoot` auto-loads the most-recent round
straight into the editor (or shows `RoundSetup` when the DB is empty).

## Goals

- A clean, restrained, highly readable overview of all flows (light mode;
  `blue = Aff`, `red = Neg`).
- Per-card scouting summary; full scouting available on demand.
- Delete a flow undoably (soft-delete → Trash; restorable).
- Import/export flows: per-flow (JSON/Excel) and bulk backup/restore.

> **PDF note (spec correction):** there is no `round → PDF file` exporter today —
> PDF is only `window.print()` over the active round (`PrintView`). Per-card
> export is therefore **JSON + Excel** only in this build; PDF parity is deferred
> until a standalone PDF exporter exists (`pdf-lib` is already a dependency).
- Open the Settings menu from the dashboard.
- Fuzzy search across flows, including argument content.

## Non-goals (deferred / out of scope)

- Duplicate-flow action.
- Auto-purge of trashed flows (manual only).
- Multi-select bulk actions on the grid.
- Path-segment editor URLs (`/flow/<id>`) — query-param routing instead.
- Searching inside the editor (the existing in-flow `SearchPalette` is unchanged).

---

## 1. Routing & app shell

The app is a Next.js **static export** (`output: "export"`). Flow ids exist only
at runtime in IndexedDB, so dynamic pre-rendered segments are not viable.
Routing is client-side with query params:

| Route             | Renders        | Notes |
|-------------------|----------------|-------|
| `/`               | `Dashboard`    | New landing screen. |
| `/flow?id=<id>`   | Editor (`Workspace`) | Reads `id` from the query string; loads that round into the store. Missing / not-found / trashed id → redirect to `/`. |
| `/trash`          | `TrashView`    | No params; static-export safe. |

Each of `/flow` and `/trash` is its own static page (`src/app/flow/page.tsx`,
`src/app/trash/page.tsx`). Direct loads / hard refresh / deep links all resolve
because the corresponding `index.html` always exists.

**`AppRoot` rework.** The autosave-attach + round-load logic currently in
`AppRoot` moves into the `/flow` page — only the editor holds an active round.
The `/` page renders `Dashboard`, which reads flow summaries directly and never
puts a round into the store. `RoundSetup` is retired; its role is split between
the dashboard empty state and the quick-create role picker (§3).

**Editor return affordance.** `RoundHeader` gains a "back to flows" home
affordance (brand/logo click → `/`).

---

## 2. Data model & persistence

### 2.1 Soft delete

Add an optional field to `Round`:

```ts
deletedAt?: number | null; // ms timestamp when trashed; absent/null = live
```

- Dexie schema bump: index `deletedAt` (e.g. `rounds: "id, updatedAt, deletedAt"`).
- `listRounds()` returns only live flows (`deletedAt` null/absent).
- New `listTrash()` returns only trashed flows.
- `loadLastRound()` and autosave ignore trashed flows (a trashed flow must never
  be auto-resurrected into the editor).
- `normalizeRound` preserves `deletedAt` for stored rounds; **import always
  clears it** (imported flows are never trashed — see §2.4).

`deletedAt` is genuine round lifecycle state (not derived), so it lives on
`Round`. It is undefined for live flows, so it does not meaningfully affect the
JSON export.

### 2.2 Extended summary for the grid

`listRounds()` currently returns `{ id, updatedAt, createdAt, role }`. Extend the
`RoundSummary` to carry everything the card + sort + grouping need, derived from
each round's `scouting` without loading nodes:

```ts
interface RoundSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  role: Role;
  affTeam: string;   // teamCode(affSchool, aff.first, aff.second) — may be ""
  negTeam: string;   // teamCode(negSchool, neg.first, neg.second) — may be ""
  tournament?: string;
  round?: string;
  date?: string;
  judge?: string;
  decision?: Decision; // { vote?: "aff" | "neg"; rfd?: string }
}
```

Cards render fallbacks ("Untitled Aff" / "Untitled Neg", "—", "undecided")
when fields are blank. `teamCode()` already degrades gracefully (school only,
single debater, or "").

### 2.3 Search index

A separate Dexie table keeps the `Round` model and the JSON file format clean:

```ts
searchIndex: "id"   // { id: string; searchText: string }
```

- `searchText` = lowercased concatenation of scouting fields (team codes,
  schools, all four debater names, tournament, round, judge, RFD) **and all
  node `text`** for that round.
- Written/updated whenever a round is persisted (`persistRound`), in the same
  logical operation.
- Backfilled for existing rounds via a one-time migration / lazy build on first
  dashboard load (compute from each stored round, write the table).
- Deleting a round forever also removes its `searchIndex` row.

### 2.4 Import

- Accepts two envelope shapes, auto-detected:
  - Single flow: `{ version, round }` (existing format).
  - Backup bundle: `{ version, kind: "backup", rounds: Round[] }` (new).
- **Every imported round gets a fresh `id` and `createdAt`** and `deletedAt`
  cleared, so import never clobbers an existing flow (a re-imported file becomes a
  distinct copy). `updatedAt` set to import time.
- Each imported round is normalized (`normalizeRound`) and its `searchIndex`
  row is built.
- Invalid files surface a clear error (reuse `importRoundJSON`'s error messages;
  add a backup-shape validator).

### 2.5 Export

- **Per flow (card kebab / drawer):** JSON / Excel. The underlying exporters
  already take a round argument (`downloadRoundFile(round)`,
  `downloadXlsx(round, opts)`), so the dashboard loads the full round by id,
  reads global display options from the store (`autoNumber`), and calls them.
  PDF is **not** offered from the dashboard in this build (no standalone PDF
  exporter exists — see the PDF note above). The editor's `ExportMenu` is
  unchanged (JSON + Excel + the existing Print path).
- **Export all (top bar):** writes a backup envelope
  `{ version, kind: "backup", rounds: <all live rounds> }` as a single file.

---

## 3. Dashboard page (`/`)

### 3.1 Layout

- **Top bar:** `DebateFlow` brand · fuzzy search box · Import (↓) · Export all ·
  Settings (⚙) · **+ New flow** (primary). (Import + Export all may be a single
  split control — settled in planning.)
- **Controls row:** flow count · **Sort** dropdown (Last edited [default], Date,
  Tournament, Result) · **Group by tournament** toggle. When grouped, cards sit
  under collapsible tournament section headers and the sort applies within each
  group. Flows with no tournament group under an "Ungrouped" / "No tournament"
  header.
- **Grid:** responsive (≈3-up on wide), **card B**.

### 3.2 Card B (the flow preview)

- **Header row:** matchup — `affTeam` (blue) `vs` `negTeam` (red), with
  italic-muted "Untitled Aff/Neg" fallback — and a role **pill**
  (Aff blue / Neg red / Judge gray).
- **Body (label/value rows):** Tournament, Round, Judge, Result. Result shows
  the winning side colored (`Aff` blue / `Neg` red) with optional ballot count
  if present in RFD/decision; "undecided" muted when no vote.
- **Footer:** date · "edited Xago".
- **Hover:** `···` kebab (top-right). Always available on touch.
- **Whole-card click → open editor** (`/flow?id=`).

### 3.3 Kebab menu

- **View details** → detail drawer (§5.1)
- **Export ▸** → JSON / Excel
- **Delete** → soft-delete to trash + Undo toast (§5.3)

### 3.4 + New flow

Small role picker (Aff / Neg / Judge) — the one choice that shapes the initial
sheet/columns — then create the round + first sheet (as `RoundSetup` does today)
and navigate to `/flow?id=<new id>`.

### 3.5 Empty state

When no live flows exist: a friendly centered panel with **+ New flow** and
**Import** actions.

---

## 4. Search

- Inline **filter-as-you-type** in the top-bar box, over the `searchIndex`
  haystack using the existing `fuzzySearch` (`@leeoniya/ufuzzy`).
- Non-matching cards hide. Matching cards:
  - highlight matched **visible fields** inline (via `toSegments`), and
  - grow a **snippet line** showing the matched text with the hit highlighted
    when the match is in flow content not otherwise shown on the card
    (e.g. "…perm do both shields the link…").
- Search composes with sort + grouping (empty groups disappear).
- Blank query → full grid.

---

## 5. Detail drawer & Trash

### 5.1 Detail drawer

Opened from the kebab's **View details**. Read-only, using the `Dialog`/sheet
primitive:

- **Full scouting:** both schools; all four debaters (1A/2A/1N/2N); tournament,
  round, date, judge; decision (vote + full RFD text).
- **Light stats:** role, sheet count.
- **Actions:** Open in editor · Export ▸ (JSON/Excel) · Delete.

Loads the full round by id on open (cheap, single round).

### 5.2 Trash (`/trash`)

- Lists trashed flows (`listTrash()`), reusing card B in a muted treatment.
- Per-flow: **Restore** (clears `deletedAt`) and **Delete forever**
  (removes the round + its `searchIndex` row; confirmed).
- **Empty trash** action (confirmed) permanently removes all trashed flows.
- **No auto-purge** — manual only.

### 5.3 Undo on delete

- Deleting from the grid sets `deletedAt` and shows a non-intrusive toast
  ("Flow moved to trash — Undo").
- **Undo** clears `deletedAt`, returning the flow to the grid.
- Independent of the toast, the flow is always recoverable from `/trash`.

---

## Component / module inventory

New:

- `src/app/flow/page.tsx` — editor route (reads `?id=`, loads round, redirect guard).
- `src/app/trash/page.tsx` — trash route.
- `src/components/dashboard/Dashboard.tsx` — page shell, controls, grid, grouping.
- `src/components/dashboard/FlowCard.tsx` — card B + kebab.
- `src/components/dashboard/FlowDetailDrawer.tsx` — read-only scouting drawer.
- `src/components/dashboard/DashboardSearch.tsx` (or inline) — search box + filter logic.
- `src/components/dashboard/NewFlowButton.tsx` — role picker → create → navigate.
- `src/components/dashboard/ImportControl.tsx` — single + backup import.
- `src/components/TrashView.tsx` — trash list + restore / delete-forever / empty.
- `src/components/ui/` — add `toast`/sonner-style toast and `sheet`/drawer primitives if not present (prefer a maintained primitive over rolling our own).
- `src/lib/persistence/searchIndex.ts` — index table CRUD + builder.
- `src/lib/persistence/backup.ts` — backup envelope export/import + detection.
- `src/lib/dashboard/summary.ts` — build `RoundSummary` from a `Round`.

Changed:

- `src/lib/persistence/db.ts` — schema bump (`deletedAt` index, `searchIndex` table) + migration.
- `src/lib/persistence/autosave.ts` — extended `RoundSummary`, `listTrash`, soft-delete-aware `deleteRound`/restore/`loadLastRound`, write `searchIndex` on persist.
- `src/lib/persistence/io.ts` — fresh-id-on-import, clear `deletedAt`.
- `src/lib/model/types.ts` — `Round.deletedAt`.
- `src/lib/model/normalize.ts` — preserve `deletedAt`.
- `src/app/page.tsx` — render `Dashboard`.
- `src/components/AppRoot.tsx` — relocate load/autosave to `/flow` page (or repurpose as the flow page body).
- `src/components/RoundHeader.tsx` — home/back-to-flows affordance.
- `src/lib/export/run.ts` (new) — shared `runExport(round, opts, fmt)` helper used by both `ExportMenu` and the card/drawer menus (JSON + Excel). `ExportMenu` is otherwise unchanged.

Removed/retired:

- `src/components/RoundSetup.tsx` — superseded by empty state + quick-create.

## Testing

- `summary.ts`: team-code + fallback derivation from varied scouting.
- `searchIndex`: build/update/delete; content + scouting both searchable.
- `backup.ts`: round-trip export-all → import; single vs backup detection; invalid shapes.
- persistence: soft-delete hides from `listRounds`, appears in `listTrash`; restore; delete-forever clears index; `loadLastRound` skips trashed; import assigns fresh ids and clears `deletedAt`.
- Dexie migration: existing rounds gain `searchIndex` and remain live.
- Components: `FlowCard` rendering + fallbacks; kebab actions; search filter + snippet highlight; grouping/sort; empty state; trash restore/delete; redirect guard on `/flow` with bad id.

## Key decisions (resolved during grilling)

1. Dashboard is the home, real URLs → **query-param routing** (`/flow?id=`), static-export safe.
2. Card density → **compact card + detail drawer**; card = **design B** (mini info-sheet).
3. Per-card actions → **kebab menu** on hover.
4. Per-card export → **JSON + Excel** (PDF deferred — no standalone PDF exporter exists yet).
5. Import → **always a new flow** (fresh id); **bulk Export all + multi-flow import** supported.
6. Delete → **trash bin (soft delete)**, **separate `/trash` route**, **manual purge only**, plus Undo toast.
7. Search → **all node content + scouting**, via a **precomputed `searchText` in a separate Dexie index table**; content matches shown as a **highlighted snippet line**.
8. Organization → **sort control + group-by-tournament**.
9. Card click → **opens the editor**; drawer via the kebab.
10. New flow → **quick-create with an inline role picker**, then into the editor.
