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
- **Radix UI** + **lucide-react** for UI primitives and icons
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
  components/    React components (PascalCase.tsx, colocated *.test.tsx)
    ui/          Radix-based shadcn-style primitives
    dashboard/   Flows dashboard components
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

## Notes for agents

- There is no server; `npm run build` produces a static site in `./out`.
- When adding a UI primitive, follow the existing `components/ui` (shadcn-style)
  patterns; `components.json` configures the generator.
- Do not commit unless asked. Never add Claude/Anthropic attribution trailers to
  commits.
