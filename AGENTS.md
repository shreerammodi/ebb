# AGENTS.md

Guidance for AI agents working in this repository.

## Project

**Debate Flow** is a local-first, privacy-centric, keyboard-first web app for
flowing competitive debate rounds. All data lives in the browser (IndexedDB via
Dexie); there is no backend. The app is built as a static export.

## Tech stack

- **Next.js 15** (App Router, `output: "export"` — static site, no server)
- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** (config-less; theme lives in `src/app/globals.css`)
- **Zustand** for state (`src/lib/store`)
- **Dexie** (IndexedDB) for persistence
- **Radix UI** + **@phosphor-icons/react** for UI primitives and icons
- **Vitest** + **Testing Library** (jsdom, `fake-indexeddb`) for tests

## Commands

```bash
npm run dev          # start dev server
npm run build        # static production build (next build → ./out)
npm test             # run the full Vitest suite once
npm run test:watch   # watch mode
npm run lint         # next lint (eslint)
npm run format       # oxfmt .
npm run format:check # oxfmt --check .
```

Run `npm test` and `npm run lint` before considering a change complete.

## Layout

```
src/
  app/           Next.js App Router (layout, page, globals.css)
  components/    React components (PascalCase.tsx, colocated *.test.tsx),
                 grouped by domain:
    ui/          Radix-based shadcn-style primitives
    brand/       Logo and brand assets
    dashboard/   Flows dashboard components
    flow/        Flow screen: AppRoot, Workspace, FlowGrid, cells, header,
                 sidebar, info panel, print/export
    guide/       Onboarding guide dialog and flow coach
    history/     Undo tree panel
    palette/     Command/search palettes, keybindings cheatsheet
    settings/    Settings panel
    trash/       Trash view
    update/      Update provider, chip, critical-update modal
  lib/           Framework-agnostic logic, grouped by domain:
    model/       Round/flow data model, types, normalization, numbering
    store/       Zustand store (useRoundStore)
    persistence/ Dexie DB, autosave, backup, import/export IO
    grid/        Grid columns, layout, navigation
    keymap/      Keybinding resolution + useKeymap hook
    commands/    Command registry
    export/      Export to xlsx/csv
    search/      Fuzzy search (@leeoniya/ufuzzy)
    dashboard/   Dashboard filter/organize/summary logic
    format/      Debate format presets
```

`@/*` is aliased to `src/*` (see `tsconfig.json`).

## Conventions

- **Tests are colocated** next to source as `*.test.ts(x)`. Most `lib/` modules
  have a sibling test; keep new logic covered and test-driven where practical.
- **Pure logic goes in `src/lib`**, not in components. Keep `lib/`
  framework-agnostic and testable; components wire it to React.
- **Local-first**: never add network calls, telemetry, or backend dependencies.
  All state is client-side.
- Keyboard-first UX is a core product value — preserve and extend keybindings
  rather than replacing them with mouse-only flows.

## Comments

Distilled from a 2026-07 audit that pruned drifted comments across `src/`.
A comment earns its place by stating a why, an invariant, or a non-obvious
edge case; otherwise leave the code bare.

- **Describe current behavior, in present tense.** Never narrate the change
  you are making: no "now uses X", "no longer stored", "previously",
  "replaces the old X". Those go in the commit message; the comment states
  the surviving fact ("deleting an argument never vaporizes the answers
  written under it"), not its history.
- **No plan or ticket artifacts.** Task numbers, milestone labels, and spec
  references ("(Task 6)", "M3:", "per spec") mean nothing to a future reader.
  This applies to section banners and test `describe` titles, not just prose.
- **No conversation echoes or thinking-out-loud.** Nothing addressed to a
  reviewer ("as requested"), and no left-in self-corrections ("... - wait,
  actually it calls orphanNode"). Resolve the thought, write the conclusion.
- **Update docs when the code they describe changes.** JSDoc drifts silently
  during refactors: after the `order` field became `row`, three navigation
  docs still said "order"; a test kept "Re-import to pick up the new
  navigator.platform" after the re-import was removed. When renaming a field
  or restructuring, grep comments for the old name too.
- **Attach JSDoc to the symbol it documents**, immediately above it - not
  above a neighboring cache variable or a sibling declaration.
- **No mirror comments** that restate the adjacent line ("// clear on
  unmount" on a cleanup assignment), and no hedges that misstate behavior
  ("assumes the group exists" on code that safely no-ops).
- **Section banners are a deliberate convention** (`// ─── Actions ───...`);
  keep them, and keep directive comments (`eslint-disable`,
  `@ts-expect-error`) intact.
- **Use the model's vocabulary** (`src/lib/model/types.ts` is the source of
  truth): a **sheet** is a page of the flow (not "page"/"tab"); a **node** is
  an `ArgumentNode` datum; a **cell** is the grid slot at `(speechId, row)` -
  never conflate node and cell; a **speech** is a column identity ("column"
  is fine for the visual dimension); **side** is aff/neg while **role** also
  includes judge. In export code, disambiguate the app's `Sheet` from Excel
  worksheets explicitly.

## Notes for agents

- There is no server; `npm run build` produces a static site in `./out`.
- When adding a UI primitive, follow the existing `components/ui` (shadcn-style)
  patterns; `components.json` configures the generator.
- Prefer `git rebase` over `git merge` when integrating changes to maintain a
  linear history.
