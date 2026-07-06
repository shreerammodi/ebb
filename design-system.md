# Ebb — Design System

Ebb (Debate Flow) is a local-first, keyboard-first web app for flowing
competitive debate rounds. The aesthetic is quiet, dense, and utilitarian:
neutral chrome with color reserved for meaning. This document is the extracted
system of record; the live source is `src/app/globals.css`.

## Core principle

**Color is reserved and meaningful. Everything else is a neutral.**

- Blue = Aff (affirmative side)
- Red = Neg (negative side)
- Violet = selection / focus
- Amber = warning
- Green = good / success

A component that needs color reuses a token; hex/oklch/rgba literals outside the
token file are treated as a bug. Every color swaps between light and dark by
redefining a small set of CSS variables, never by touching components.

## Color tokens

Tokens are CSS variables (oklch for neutrals, hex for the meaningful accents).
Light values first, dark values second.

### Surfaces

The canvas sits one step below panels so headers, cards, and the paper-white
flow sheet read as lifted.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--background` | app canvas | `oklch(0.972 0.003 286)` | `oklch(0.145 0.005 285.8)` |
| `--foreground` | body text | `oklch(0.145 0.005 285.8)` | `oklch(0.93 0.004 286)` |
| `--card` | panels: headers, sidebar, cards | `oklch(1 0 0)` | `oklch(0.195 0.006 285.9)` |
| `--popover` | floats above cards | `oklch(1 0 0)` | `oklch(0.225 0.006 285.9)` |

Dark-theme foreground is deliberately off pure white; pure white on dark halates
on LCDs.

### Neutral interaction fills

Secondary / muted / accent share one step so hover and rest fills stay legible
on both the canvas and white panels.

| Token | Light | Dark |
|---|---|---|
| `--primary` | `oklch(0.205 0.006 285.9)` | `oklch(0.92 0.004 286.32)` |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0.006 285.9)` |
| `--secondary` / `--muted` / `--accent` | `oklch(0.955 0.003 286.3)` | `oklch(0.27 0.006 286)` |
| `--muted-foreground` | `oklch(0.49 0.015 285.9)` | `oklch(0.712 0.013 286)` |
| `--border` | `oklch(0.898 0.005 286.3)` | `oklch(1 0 0 / 12%)` |
| `--input` | `oklch(0.898 0.005 286.3)` | `oklch(1 0 0 / 16%)` |

`--muted-foreground` holds AA (>=4.5:1) on both white panels and the tinted
canvas. In dark, borders are slightly lighter than the surfaces they edge —
they carry elevation because shadows barely read on dark.

### Meaningful accents (side + status)

These appear on chrome, so dark brightens them to hold AA contrast. The flow
sheet re-pins the light values because it is paper.

| Token | Meaning | Light | Dark |
|---|---|---|---|
| `--aff` | affirmative | `#1d4ed8` | `#7da2ff` |
| `--neg` | negative | `#c0271f` | `#f0776b` |
| `--sel` | selection / focus | `#7c3aed` | `#a78bfa` |
| `--warn` | warning | `#b45309` | `#f59e0b` |
| `--good` | success | `#047857` | `#34d399` |
| `--destructive` | danger action | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |

`--ring` (focus ring) aliases `--sel` so shadcn primitives and grid cells share
one focus language.

## Typography

Three typefaces, self-hosted (`next/font/local`), each with a semantic role.

| Variable | Family | Role |
|---|---|---|
| `--font-sans` | IBM Plex Sans | all UI chrome (default body) |
| `--font-mono` | Commit Mono | code, keys, tabular / monospace contexts |
| `--font-flow` | DM Sans | the flow sheet (the debate grid content) |

Base: `14px` / line-height `1.5`, antialiased
(`-webkit-font-smoothing: antialiased`), `text-wrap: pretty`.

Weights loaded: IBM Plex Sans 400/500/600/700 (+400 italic); DM Sans
400/500/600/700 (+400 italic); Commit Mono 200–700 in 100 steps (each with
italic). Emphasis in the flow sheet is 700 (`.flow-bold`).

## Radius

Single `--radius: 0.625rem` (10px) scales the rest:

| Token | Value |
|---|---|
| `--radius-sm` | `radius - 4px` |
| `--radius-md` | `radius - 2px` |
| `--radius-lg` | `radius` |
| `--radius-xl` | `radius + 4px` |

The flow sheet is the exception: `--ht-border-radius: 0` — it meets the chrome
flush and squared, like a full page.

## Focus & selection

Keyboard-first, so focus is loud and consistent:

- `:focus-visible` → `outline: 2px solid var(--sel); outline-offset: 2px;`
  (violet, never the browser default).
- Mouse/touch focus (`:focus:not(:focus-visible)`) → no outline.
- `::selection` → `background: color-mix(in srgb, var(--sel) 30%, transparent)`.
  Background only, never `color`, so text stays readable on any surface
  including the light-locked paper under dark theme.

## Motion

- `--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1)` — natural deceleration for
  state-conveying transitions (drag, flash).
- Buttons scale to `0.96` on active press, gated behind `motion-safe:`.
- Transitions are scoped to `color, background-color, border-color, box-shadow,
  scale` — never `all`.

## Components (shadcn-style, Radix-based)

Primitives live in `src/components/ui`, built with `class-variance-authority`.
Button is the reference:

**Button variants:** `default` (primary fill), `destructive`, `outline`
(transparent + `shadow-xs` + border), `secondary`, `ghost` (hover fill only),
`link`.

**Button sizes:** `xs` (h-6), `sm` (h-8), `default` (h-9), `lg` (h-10), plus
icon squares `icon-xs` (size-6) / `icon-sm` (size-8) / `icon` (size-9) /
`icon-lg` (size-10). Icons default to `size-4` (`size-3` at xs).

Shared button shell: `inline-flex items-center justify-center gap-2 rounded-md
text-sm font-medium`, disabled → `opacity-50 pointer-events-none`, invalid →
destructive ring.

Available primitives: button, card, dialog, sheet, dropdown-menu, select,
input, label, switch, kbd, tooltip, confirm-dialog, skeleton.

## The flow sheet (special surface)

The debate grid (Handsontable) is treated as **paper**: it stays on fixed light
values regardless of the app theme, like a physical page under any light. It
re-pins `--aff`/`--neg` to their light values, uses `--font-flow` (DM Sans),
zero border radius, and violet (`#7c3aed`) cell selection.

Sheet-specific marks:
- `.flow-highlight` → solid yellow `#fde047` cell background.
- `.flow-card` → inset bottom rule `#2563eb` (2px, via box-shadow so it never
  shifts cell metrics) marking a read card.
- `td.cell-aff` / `td.cell-neg` → cell ink wears its column's side color.

## Print

Chrome hidden (`.no-print`), print-only blocks shown (`.print-only`), body
forced to white/black. Flow decorations (`flow-highlight`, `flow-card`) print
with `print-color-adjust: exact`.

## Stack context

Next.js 15 static export · React 19 · TypeScript strict · Tailwind CSS v4
(config-less, theme in `globals.css`) · Radix UI + Lucide icons. Local-first:
no backend, no telemetry, no network. Keyboard-first UX is a core value.
