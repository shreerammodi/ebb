# Tooltips Throughout the App — Design

## Goal

Add visible, accessible tooltips across the app's controls. Surface descriptive
labels for icon-only and toolbar controls, and reinforce the keyboard-first UX
by showing the bound keyboard shortcut whenever a control maps to a command.

## Constraints

- Local-first: no network calls, no new backend dependencies.
- Match existing `src/components/ui/` shadcn-style patterns (`data-slot`, `cn`,
  `tw-animate-css` animation utilities as in `dialog.tsx`).
- Reuse the existing keymap layer for shortcut rendering. Do not add new keymap
  logic.
- Preserve existing `aria-label`s and keyboard-first flows.

## Component 1 — Tooltip primitive (`src/components/ui/tooltip.tsx`)

A shadcn-style wrapper over `radix-ui`'s `Tooltip`. Exports the raw Radix parts
plus one convenience component:

- `TooltipProvider` — shared timing/skip-delay context.
- `Tooltip` — `radix-ui` `Tooltip.Root`.
- `TooltipTrigger` — `radix-ui` `Tooltip.Trigger`.
- `TooltipContent` — `radix-ui` `Tooltip.Content` + `Tooltip.Portal`, styled to
  match the design system, animated via `tw-animate-css`
  (`data-[state]`-driven `fade`/`zoom`), with an arrow and `sideOffset`.
- `Tip` — convenience wrapper:
  `<Tip label="Settings" command="settings.open">{children}</Tip>`.
  Renders `TooltipTrigger` (with `asChild`) wrapping `children`, and
  `TooltipContent` showing `label`. When `command` is provided, it calls
  `keyHintFor(command)` and, if non-null, renders the chord as a muted,
  slightly-boxed `<kbd>`-style span to the right of the label
  (e.g. `Settings  ⌘,`). When the command is unbound or `command` is absent,
  renders label only.

### `Tip` props

```ts
interface TipProps {
    label: React.ReactNode;
    command?: CommandId; // optional; drives the shortcut hint
    side?: "top" | "right" | "bottom" | "left";
    children: React.ReactNode; // the trigger element (asChild)
}
```

### Provider placement

Mount a single `TooltipProvider` (with `delayDuration` ≈ 500ms) at the app root
in `src/app/layout.tsx` so all tooltips share timing and the
"skip delay on quick re-hover" behavior.

## Component 2 — Shortcut display

Reuse `keyHintFor(commandId: CommandId): string | null` from
`src/lib/keymap/displayChord.ts`. It reads the live (effective) keymap, so
tooltips automatically reflect user remaps. No new keymap code is introduced.

The chord renders in a muted, slightly-boxed style to the right of the label
inside `TooltipContent`.

## Component 3 — Call-site rollout ("everywhere applicable")

Each control's existing `aria-label` becomes a visible tooltip. Controls that
map to a command also show the shortcut.

| Area          | Controls                                     | Command (shortcut)                    |
| ------------- | -------------------------------------------- | ------------------------------------- |
| RoundHeader   | Guide                                        | `help.open`                           |
| RoundHeader   | Info                                         | `info.open`                           |
| RoundHeader   | Settings                                     | `settings.open`                       |
| RoundHeader   | Import, Export trigger                       | label only                            |
| Sidebar       | Expand / Collapse                            | `sidebar.toggle`                      |
| Sidebar       | Delete sheet                                 | label only                            |
| Sidebar       | Sheet tabs                                   | full name when truncated (label only) |
| ExportMenu    | menu trigger                                 | label only                            |
| SearchPalette | search trigger                               | label only                            |
| InfoPanel     | close                                        | label only                            |
| SettingsPanel | close, reset-binding buttons                 | label only                            |
| SaveStatus    | convert `title=` → tooltip (last-saved time) | label only                            |

### Sheet-tab truncation tooltips

Sheet tabs show the full sheet name in a tooltip when the displayed name is
truncated. Included in this pass.

### Deferred: per-cell grid markers

`GridCell`'s `title="dropped"` marker and other per-cell tooltips are **out of
scope** for this pass. The grid is performance-sensitive and high-frequency;
wrapping a `Tooltip` per cell adds overhead. Revisit as a follow-up if desired.

## Testing

- Unit test for `Tip` (`tooltip.test.tsx`):
    - renders the label,
    - renders the chord when the command is bound (mock `keyHintFor`),
    - omits the chord when the command is unbound or absent.
- Existing accessibility tests must continue to pass; `aria-label`s are
  preserved (Radix `TooltipContent` adds its own labelling on top).
- Run `npm test` and `npm run lint` before considering the change complete.

## Out of scope

- Per-cell grid tooltips (drop markers, cell-level hints).
- Any change to keybindings or the command registry.
- Mobile/touch tooltip behavior beyond Radix defaults.
