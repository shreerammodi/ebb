# Modernization Assessment - ebb (Debate Flow)

Date: 2026-07-02. Produced by `/modernize-assess` (single-system mode, repo root).
Line counts via `git ls-files` + `wc -l`; complexity ranked by decision-keyword
density per file (`scc` and `cloc` were not installed). Analysis by two
legacy-analyst agents (structure, debt) and one security-auditor agent run in
parallel; `npm audit` executed, `cargo audit` not installed.

Note: a component reorganization (`src/components/*.tsx` into domain
subdirectories `flow/`, `palette/`, `guide/`, `settings/`, `trash/`, `update/`,
`history/`, `brand/`) was in flight, uncommitted, in a concurrent session while
this assessment ran. Paths below reflect the post-reorganization layout;
re-verify against HEAD once that work commits.

## Executive Summary

Ebb is a local-first, keyboard-first debate-flowing app: a static-export
Next.js 15 / React 19 / TypeScript-strict web app (~23.6k lines of TS/TSX, 44%
of which is colocated tests) plus a deliberately thin Tauri 2 Rust desktop
shell (163 lines) with signed auto-updates. Nothing in the stack is legacy;
every framework is on its current major version, `npm audit` is clean, and a
security review was independently run and remediated the same day as this
assessment. The risk profile is low and the debt is structural, concentrated
in one 1,075-line Zustand god store and the render/persistence plumbing around
it. Headline recommendation: no modernization program is warranted; fold the
top structural-debt items into normal backlog work (Refactor-in-place).

## System Inventory

Counting tool: `git ls-files` + `wc -l` (fallback; `scc`/`cloc` unavailable).

| Language / kind        | Files | Lines  | Notes                                   |
| ---------------------- | ----- | ------ | --------------------------------------- |
| TypeScript (`.ts`)     | 124   | 14,185 | includes 10,429 lines of tests overall  |
| TSX (`.tsx`)           | 73    | 8,760  | 78 test files across ts/tsx             |
| Rust (`.rs`)           | 4     | ~163   | `src-tauri/` shell (lib, main, menu)    |
| CSS                    | 1     | 683    | Tailwind v4 theme in `globals.css`      |
| Markdown               | 12    | 1,658  | product, roadmap, desktop, plans/specs  |
| JSON / config          | 10    | ~10.4k | mostly `package-lock.json`              |

Non-test application source under `src/`: ~12.4k lines.

**Tech fingerprint** (from `package.json`, `src-tauri/Cargo.toml`, configs):

- Next.js 15 App Router, `output: "export"` (static site, no server), React 19
- TypeScript 5.8 strict; `@/*` aliased to `src/*`
- Tailwind CSS v4 (config-less), Radix UI via shadcn-style primitives,
  Phosphor icons
- Zustand 5 (`src/lib/store/useRoundStore.ts`), Dexie 4 over IndexedDB
  (schema at v6, `src/lib/persistence/db.ts`)
- Vitest 4 + Testing Library (jsdom, `fake-indexeddb`)
- Tauri 2 desktop shell with `tauri-plugin-updater` (Ed25519-signed updates)
  and `tauri-plugin-process`; Rust 1.77 edition 2021
- No backend, no network calls, no telemetry (by design; see PRODUCT.md)

**Highest-complexity files** (decision-point density, non-test):
`src/lib/store/useRoundStore.ts`, `src/lib/commands/commands.ts`,
`src/components/flow/FlowGrid.tsx`, `src/lib/grid/coords.ts`,
`src/lib/export/xlsx.ts`.

**Integration points**: browser file import/export (JSON round files and
backups, xlsx download), print view, and the desktop updater fetching a
`latest.json` manifest. That manifest fetch is the app's only network call,
desktop-only.

**Test signal**: 78 colocated test files, ~10.4k test lines against ~12.4k
source lines. Nearly every `lib/` module has a sibling test; notable gaps in
`src/lib/update/useAutoUpdate.ts` and `src/components/flow/Workspace.tsx`.

## Architecture-at-a-Glance

Diagram: `analysis/ARCHITECTURE.mmd`. Three routes (`/` dashboard, `/flow`
editor, `/trash`) sit on a single Zustand store, which mutates a `Round`
document (`src/lib/model/types.ts`, ~70 import sites, the system's data
contract). Persistence is a debounced store subscriber writing to Dexie.
Keyboard input flows keymap -> command registry -> store actions. The Tauri
shell hosts the static build and adds only window lifecycle, a display-only
menu, and updater plugins reached via dynamic import.

| #  | Domain                    | Key locations                                      | Depends on                              |
| -- | ------------------------- | -------------------------------------------------- | --------------------------------------- |
| 1  | Data Model & Format       | `src/lib/model/*`, `src/lib/format/presets.ts`     | Grid (cycle via `normalize.ts`)          |
| 2  | Grid Engine               | `src/lib/grid/*`                                   | Model, Format                            |
| 3  | Round Store (hub)         | `src/lib/store/useRoundStore.ts` (1,075 lines)     | Model, Grid, History, Commands, Update   |
| 4  | Persistence               | `src/lib/persistence/*` (Dexie v6, autosave, IO)   | Model, Grid, History, Dashboard-summary  |
| 5  | Undo History              | `src/lib/history/*`, `components/history/`         | Model; panel -> Store                    |
| 6  | Commands & Keymap         | `src/lib/commands/*`, `src/lib/keymap/*`           | Model, Grid, Store, Format               |
| 7  | Flow Editor UI            | `src/components/flow/`, `palette/`, `settings/`    | Store, Commands, Persistence, Export     |
| 8  | Dashboard, Search & Trash | `src/components/dashboard/`, `trash/`, `lib/search`| Model, Persistence, Store, Export, Guide |
| 9  | Export & Print            | `src/lib/export/*`, `flow/ExportMenu`, `PrintView` | Model, Grid, Persistence                 |
| 10 | Update subsystem          | `src/lib/update/*`, `components/update/`           | Store; Tauri plugins via dynamic import  |
| 11 | Guide & Coach             | `src/lib/guide/*`, `components/guide/`             | Store, Model, Keymap                     |
| 12 | UI Foundation & Shell     | `components/ui/*`, `lib/utils`, `src-tauri/`       | (consumed by all UI domains)             |

Known cycles: model <-> grid (`src/lib/model/normalize.ts` imports
`grid/migrateRows`); store <-> persistence is type-only in both directions
(runtime acyclic).

Dangling / dead modules (only their own tests import them):
`src/lib/grid/move.ts`, `src/lib/grid/navigation.ts` (superseded by live logic
in `model/tree.ts` and `commands/commands.ts`), `src/lib/guide/guideSeen.ts`,
and unconsumed shadcn primitives `components/ui/card.tsx`, `ui/label.tsx`.

## Production Runtime Profile

No telemetry is available, and none will be: the product is local-first with
an explicit no-telemetry commitment (PRODUCT.md "Local-first and lossless").
This step is a deliberate product constraint, not a tooling gap. Runtime risk
must instead be assessed statically; the render-path finding (Technical Debt
item 2) is the closest thing to an operational hot spot and is worth a React
Profiler pass before restructuring.

## Technical Debt (top 10, ranked by remediation value)

Sources: legacy-analyst debt scan, static reading only (tests/lint not run by
the agent). No credentials appear in any finding.

1. **`useRoundStore` is a god module spanning five domains.**
   `src/lib/store/useRoundStore.ts` (1,075 lines, ~45 actions): document
   editing, undo-tree plumbing, eight UI-panel boolean setters, embedded
   localStorage settings persistence, and update config in one `create()`
   call. Every UI toggle notifies every document subscriber. Remediation:
   split into slices (document/history, transient UI, persisted settings) and
   move localStorage helpers to `lib/persistence`.
2. **FlowGrid derives state via string-serialization selectors.**
   `src/components/flow/FlowGrid.tsx:31-45` builds a `structuralKey` string
   from every node (including `text`) on every store change, and
   `:56-60` runs full `detectDrops` inside a selector. Because UI flags share
   the store, this O(n) work fires per keystroke and per panel toggle.
   Remediation: select `round.nodes` by reference (`useShallow`) and memoize
   off the array reference.
3. **Settings persistence is triplicated with a drift hazard.** The same
   SSR-guard/try-catch/merge pattern appears in `useRoundStore.ts:269-294`,
   `:307-337`, and `src/lib/update/settings.ts:6-31`; the display setters
   (`useRoundStore.ts:955-1003`) each hand-assemble the full settings object,
   so a new field must be added in four places. Remediation: one generic
   `createLocalStorageSetting<T>` helper plus a `patchDisplaySettings` action.
4. **Dead "legacy" store actions kept alive by their own tests.** `addNode`
   (`useRoundStore.ts:563-579`, self-labeled legacy), `setNodeParent`
   (`:633-644`), `moveCellTo` (`:803-826`); zero non-test callers.
   Remediation: delete all three plus their tests.
5. **Non-null assertions in the grab-move commit path.**
   `src/lib/commands/commands.ts:390-398` uses `!` on two sheet lookups where
   every other path null-checks; a stale `moveSource` crashes the keyboard
   handler. Cross-sheet grab-move correctness is also untested. Remediation:
   guarded lookups that reset `moveSource`, and an explicit cross-sheet
   decision.
6. **Keymap dispatch escapes the type system.**
   `src/lib/keymap/useKeymap.ts:119` has the codebase's only `as any`, exactly
   where a typo'd binding silently no-ops. Remediation: type binding tables as
   `Record<string, CommandId>` and delete the cast.
7. **Undo-history persistence is fire-and-forget.**
   `src/lib/persistence/autosave.ts:221,237` `void`s `persistHistory`
   rejections while round autosave carefully reports `saving/saved/error`; a
   failing IndexedDB write silently loses undo trees. The two attach functions
   are also copy-paste twins. Remediation: one debounced-persist helper wired
   into the `SaveStatus` surface.
8. **SearchPalette and CommandPalette duplicate the palette shell.**
   Identical key handling and open/focus state in
   `src/components/palette/SearchPalette.tsx:139-157` and
   `CommandPalette.tsx:91-109`; SearchPalette carries the repo's only
   `eslint-disable`. Remediation: shared `usePaletteNav` hook or generic
   `<Palette>` component.
9. **Test gap in the update stack's orchestrator.**
   `src/lib/update/useAutoUpdate.ts` (135 lines: overlap guard, held-update
   semantics, download-failure fallbacks) is the only untested module in
   `lib/update`; `Workspace.tsx` is the other untested orchestrator.
   Remediation: Vitest suite mocking `./adapter`.
10. **`executeCommand` is a 280-line switch decoupled from the registry.**
    `src/lib/commands/commands.ts:154-436`: ~40 handlers in one switch with no
    exhaustiveness check; adding a command touches three files. Remediation:
    handlers on registry entries with a `never` guard.

## Security Findings

`npm audit`: 0 vulnerabilities (prod and full). No XSS sinks, no
`dangerouslySetInnerHTML`/`innerHTML`/`eval`, no `window.open` or `postMessage`
surfaces, no prototype-pollution-prone merges, and **no hardcoded secrets**
(the updater pubkey in `tauri.conf.json` is a public key by design). Tauri
capabilities are minimal (no shell/fs/http/dialog; no custom IPC commands).
xlsx formula injection is mitigated by construction (`inlineStr` + XML
escaping, `src/lib/export/xlsxParts.ts:51-56`). A prior security review was
remediated in commit `6f569b3e6240` (docs/security-review.md), same day as
this assessment.

| Severity | CWE                        | Finding                                                                                                                                                          | Location                                                                            | Recommendation                                                                                                    |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Medium   | CWE-20                     | Backup import skips `SUPPORTED_VERSIONS` and neither import path deep-validates node fields; a malformed `.json` backup persists to IndexedDB and crashes the flow view on every load (stored DoS surviving reload) | `src/lib/persistence/backup.ts:52-57`, `io.ts:66-77`, `src/lib/model/normalize.ts:54-61` | One shared deep `Round` validator (field types, length caps, finite bounded row/col) called from both paths; enforce version check on backups |
| Low      | CWE-693                    | Web deployment has no CSP or security headers (bare static export, no `vercel.json` headers, no meta CSP); Tauri build has a strict CSP but the hosted build relies solely on React escaping | `next.config.mjs:7-13`                                                              | Add a `vercel.json` headers block mirroring the Tauri CSP plus `X-Content-Type-Options` and `Referrer-Policy`       |
| Low      | CWE-1104 (RUSTSEC-2024-0429) | `glib 0.18.5` transitive advisory (Linux/gtk tree only, not reachable from this thin shell)                                                                       | `src-tauri/Cargo.lock`                                                              | Bump when Tauri's Linux stack allows; add `cargo audit` to CI (not installed locally today)                          |
| Low      | CWE-345                    | Update-policy manifest fetched unauthenticated; its `critical` flag drives the tournament-blackout bypass prompt (nag risk only; installs remain Ed25519-verified) | `src/lib/update/policy.ts:69`, `adapter.ts:19-27`                                   | Acceptable as-is; optionally show manifest version/date in the critical prompt                                       |

No credential inventory file was produced because no credentials were found.

## Documentation Gaps (top 5)

1. **README.md is 13 lines.** It omits the desktop app entirely, the test/
   lint/build commands, and any pointer to PRODUCT.md/ROADMAP.md/docs/. A new
   engineer learns more from AGENTS.md than from the README.
2. **Docs claim a CSV exporter that does not exist.** AGENTS.md and
   ROADMAP.md both say "export to xlsx/csv"; `src/lib/export/` contains only
   xlsx serialization. Either the docs or the feature is missing.
3. **ROADMAP.md is stale on shipped work.** The undo tree (merged 2026-07-02)
   is absent from "Shipped", and the desktop shell is listed as "in active
   development" while `src-tauri/`, signed updates, and CI/release docs all
   exist.
4. **The on-disk data contract is undocumented.** The round-file JSON
   envelope, `SUPPORTED_VERSIONS`, backup format, and the Dexie v6 schema and
   its upgrade path exist only in code; import/export compatibility rules
   would need reverse-engineering.
5. **Dead-or-reference modules are unlabeled.** `grid/move.ts` and
   `grid/navigation.ts` have full test suites but zero production callers;
   nothing records whether they are kept deliberately as specs for the
   command-layer reimplementation or are safe to delete.

## Relative Scale

COCOMO-II basic index, computed as `2.94 x (KSLOC)^1.10` (nominal scale
factors), shown with inputs for reproducibility:

- All TS/TSX incl. tests: 22.9 KSLOC -> index ~= 2.94 x 22.9^1.10 ~= 92
- Non-test application source: 12.4 KSLOC -> index ~= 2.94 x 12.4^1.10 ~= 47

These figures are a relative size/complexity signal for ranking this system
against others in a portfolio. **They are not a timeline.** COCOMO assumes
traditional human-team productivity, which agentic transformation does not
follow; no person-months, schedule, cost, or dates are derived from them. On
any portfolio heat map this is a small, low-risk, well-tested system.

## Recommended Modernization Pattern

**Refactor (in place).** Rationale: there is nothing to migrate. Every layer
of the stack is on its current major version, the build is a static export
with no server surface, dependency audits are clean, and test coverage is
strong (78 colocated suites). The debt inventory is structural (god store,
selector-driven render cost, duplicated persistence plumbing) and is best
retired as ordinary backlog items in priority order 1 -> 2 -> 3 from the
Technical Debt list, plus the one Medium security fix (backup deep
validation). None of the heavyweight modernization routes apply: there is no
version delta for `/modernize-uplift`, no target-stack change for
`/modernize-transform`, and a `/modernize-reimagine` rebuild would discard a
healthy, well-tested codebase. If a future trigger changes this calculus, it
will be the CRDT data-model reshaping contemplated in ROADMAP.md's
collaboration aspiration; that would be a Rearchitect of the model/persistence
domains and should start with `/modernize-extract-rules` on `lib/model` to pin
the numbering/drops/extension semantics first.
