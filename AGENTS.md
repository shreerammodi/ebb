# AGENTS.md

Guidance for AI agents working in this repository.

## Project

**ebb** is a local-first, privacy-centric, keyboard-first web app for
flowing competitive debate rounds. All data lives in the browser (IndexedDB via
Dexie); there is no backend. The app is built as a static export.

Run `npm test` and `npm run lint` before considering a change complete.
Formatting is `oxfmt` (via `npm run format` / `format:check`), not Prettier.

## Conventions

- **Tests live under `test/`**, mirroring the `src/` tree: the suite for
  `src/<path>/X.ts(x)` is `test/<path>/X.test.ts(x)` and imports it via the
  `@/` alias. Most `lib/` modules have a test; keep new logic covered and
  test-driven where practical.
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
- **Section banners are a deliberate convention** (`// --- Actions ---...`);
  keep them, and keep directive comments (`eslint-disable`,
  `@ts-expect-error`) intact.
- **Use the model's vocabulary** (`src/lib/model/types.ts` is the source of
  truth): a **sheet** is a page of the flow (not "page"/"tab"); a **node** is
  an `ArgumentNode` datum; a **cell** is the grid slot at `(speechId, row)` -
  never conflate node and cell; a **speech** is a column identity ("column"
  is fine for the visual dimension); **side** is aff/neg while **role** also
  includes judge. In export code, disambiguate the app's `Sheet` from Excel
  worksheets explicitly.
- **Use plain text**. Never add symbols, glyphs, or other unicode characters.
  Only use standard ASCII characters, unless absolutely necessary. When
  representing keyboard modifiers, use standard terms Meta, Alt, Ctrl, Shift
  instead of glyphs.

## Notes for agents

- There is no server; `npm run build` produces a static site in `./out`.
- The `?` dialog (`src/components/palette/KeybindingsCheatsheet.tsx`) is a
  keyboard-shortcut reference only; conceptual/workflow docs live on the
  external site at https://ebb.smodi.net (outside this repo).
- When adding a UI primitive, follow the existing `components/ui` (shadcn-style)
  patterns; `components.json` configures the generator.
- **Binding a printable key (no Ctrl/Meta) to a command is a trap.** With the
  grid focused and no editor open, Handsontable "fast edits" the selected cell
  on any printable keydown, opening an empty editor that commits over the cell
  and erases it before the app command even runs. `HotGrid`'s `beforeKeyDown`
  guard resolves such chords (bare keys, Alt+key) against the keymap and runs
  them itself so the grid never touches the cell; keep new printable bindings
  flowing through that path, not around it.
- Prefer `git rebase` over `git merge` when integrating changes to maintain a
  linear history.
