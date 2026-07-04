---
name: ebb
description: Local-first, privacy-centric, keyboard-first flowing for competitive debate
colors:
    canvas: "oklch(0.972 0.003 286)"
    panel: "oklch(1 0 0)"
    popover: "oklch(1 0 0)"
    ink: "oklch(0.145 0.005 285.8)"
    ink-muted: "oklch(0.49 0.015 285.9)"
    fill: "oklch(0.955 0.003 286.3)"
    line: "oklch(0.898 0.005 286.3)"
    aff-blue: "#1d4ed8"
    neg-red: "#c0271f"
    selection-violet: "#7c3aed"
    warn-amber: "#b45309"
    good-green: "#047857"
    highlight-yellow: "#fde047"
    canvas-dark: "oklch(0.145 0.005 285.8)"
    panel-dark: "oklch(0.195 0.006 285.9)"
    popover-dark: "oklch(0.225 0.006 285.9)"
    ink-dark: "oklch(0.93 0.004 286)"
    aff-blue-dark: "#7da2ff"
    neg-red-dark: "#f0776b"
    selection-violet-dark: "#a78bfa"
    warn-amber-dark: "#f59e0b"
    good-green-dark: "#34d399"
typography:
    body:
        fontFamily: "IBM Plex Sans, sans-serif"
        fontSize: "14px"
        fontWeight: 400
        lineHeight: 1.5
    title:
        fontFamily: "IBM Plex Sans, sans-serif"
        fontSize: "15px"
        fontWeight: 600
        letterSpacing: "-0.01em"
    label:
        fontFamily: "IBM Plex Sans, sans-serif"
        fontSize: "13px"
        fontWeight: 500
    micro-label:
        fontFamily: "Commit Mono, monospace"
        fontSize: "9px"
        fontWeight: 700
        letterSpacing: "0.1em"
    flow:
        fontFamily: "DM Sans, sans-serif"
        fontSize: "13px"
        fontWeight: 400
rounded:
    xs: "4px"
    sm: "6px"
    md: "8px"
    lg: "10px"
    xl: "14px"
    pill: "9999px"
spacing:
    xs: "4px"
    sm: "8px"
    md: "16px"
    lg: "20px"
components:
    button-primary:
        backgroundColor: "{colors.ink}"
        textColor: "{colors.panel}"
        rounded: "{rounded.md}"
        padding: "0 12px"
        height: "32px"
    button-outline:
        backgroundColor: "transparent"
        textColor: "{colors.ink}"
        rounded: "{rounded.md}"
        padding: "0 12px"
        height: "32px"
    button-outline-hover:
        backgroundColor: "{colors.fill}"
    badge-side:
        textColor: "{colors.aff-blue}"
        rounded: "{rounded.pill}"
        padding: "2px 8px"
    kbd:
        backgroundColor: "{colors.fill}"
        textColor: "{colors.ink}"
        rounded: "{rounded.xs}"
        padding: "1px 4px"
---

# Design System: ebb

## 1. Overview

**Creative North Star: "The Tournament Instrument"**

ebb is a competition-grade instrument, not a destination. Everything on
screen exists to make flowing a debate round faster: the interface is
calibrated, dense, and quiet, and it rewards mastery the way a good
mechanical keyboard does. Chrome recedes to near-invisibility so the flow
sheet is the only thing competing for attention mid-round. Confidence is
expressed through speed, density, and correctness; never through
decoration.

The system explicitly rejects the generic SaaS dashboard (no card grids as
filler, no hero metrics, no marketing chrome), heavy toolbar-laden UI, and
playful color. Color is a reserved vocabulary with fixed meanings; a hue
that doesn't encode information doesn't appear.

**Key Characteristics:**

- Neutral zinc-cool surfaces in two themes; a subtle canvas-to-panel step
  carries all large-scale structure.
- The flow sheet is paper: light-locked in both themes, lifted off the
  canvas like a page on a desk.
- Reserved ink: blue = Aff, red = Neg, violet = selection/focus,
  amber = warn, green = good.
- Spreadsheet-tight density; 14px body, 32px controls, hairline borders.
- Motion conveys state only, 150-250ms, ease-out.

## 2. Colors

A restrained zinc-cool neutral ramp carries the entire chrome; five
reserved hues carry all meaning.

### Primary

- **Ink** (oklch(0.145 0.005 285.8)): body text and the primary button
  fill in light mode. Near-black with a whisper of the zinc hue; flips to
  off-white (oklch(0.93 0.004 286)) in dark mode to avoid halation.

### Neutral

- **Canvas** (oklch(0.972 0.003 286)): the app background. Sits one step
  below every panel so headers, cards, and the paper sheet read as lifted.
  Dark: oklch(0.145 0.005 285.8).
- **Panel** (oklch(1 0 0)): headers, sidebar, cards, dialogs. Dark:
  oklch(0.195 0.006 285.9); popovers step lighter again
  (oklch(0.225 0.006 285.9)) because borders, not shadows, carry
  elevation on dark.
- **Fill** (oklch(0.955 0.003 286.3)): hover/rest fills (secondary, muted,
  accent share this step). Legible against both canvas and panel.
- **Line** (oklch(0.898 0.005 286.3)): borders and inputs. Dark: white at
  12% (borders) and 16% (inputs), slightly lighter than the surfaces they
  edge.
- **Muted ink** (oklch(0.49 0.015 285.9)): secondary text; holds >=4.5:1
  on both canvas and panel.

### Reserved (meaning-carrying)

- **Aff Blue** (#1d4ed8, dark #7da2ff): everything affirmative — speech
  headers, side badges, team names, sheet markers.
- **Neg Red** (#c0271f, dark #f0776b): everything negative. Never used
  for errors; that's `destructive`'s job.
- **Selection Violet** (#7c3aed, dark #a78bfa): the single focus language.
  Focus rings, grid cell selection, text selection tint, overridden-key
  accents.
- **Warn Amber** (#b45309, dark #f59e0b) and **Good Green** (#047857,
  dark #34d399): save/status indicators only.
- **Highlight Yellow** (#fde047): the cell highlighter swipe on the paper
  sheet; theme-invariant because the sheet is.

### Named Rules

**The Reserved Ink Rule.** Color always encodes information: side,
selection, or status. Spending a hue on decoration is prohibited. If an
element needs emphasis, use weight, size, or position — never a new color.

**The Paper Rule.** The flow sheet stays on fixed light values in both
themes, like a physical page under any light. Side colors are re-pinned to
their light values inside it. Never theme the sheet.

**The Token Rule.** Hex/oklch/rgba literals outside `src/app/globals.css`
are a bug. Components consume tokens via Tailwind utilities (`bg-card`,
`text-aff`, `border-border`). The only exceptions are deliberately
theme-invariant surfaces (the sheet, the settings font sample).

## 3. Typography

**Body Font:** IBM Plex Sans (sans-serif)
**Flow Font:** DM Sans by default; user-selectable (Cabin, Lato, Open
Sans, IBM Plex Sans, Commit Mono, IBM Plex Mono)
**Mono Font:** Commit Mono (keycaps, chords, micro-labels)

**Character:** One workmanlike sans carries all chrome; the flow font is
the user's own writing voice on the paper sheet. Mono appears only where
keyboard precision is the subject (kbd caps, chord chips, tracked
micro-labels).

### Hierarchy

- **Title** (600, 15px): round participants in the header; card titles.
- **Body** (400, 14px/1.5): the base; set on `<body>`, everything
  inherits.
- **Label** (500, 13px): buttons, nav links, form labels, list rows.
- **Detail** (400, 12-12.5px): metadata rows, timestamps, snippets.
- **Micro-label** (700, 9px, 0.1em tracking, uppercase, mono): section
  headers in sidebar/info panel ("CX", "SHEETS"). The one deliberate
  tracked-caps voice in the system.

### Named Rules

**The One Voice Rule.** UI chrome never mixes families. Display fonts are
prohibited; hierarchy comes from weight and one-notch size steps
(12 -> 13 -> 14 -> 15), not scale drama.

## 4. Elevation

Flat plus layered surfaces. Depth is carried by the surface ramp (canvas
-> panel -> popover) and hairline borders; shadows stay whisper-quiet and
never decorative. In dark mode, shadows barely read, so borders one step
lighter than their surface take over the elevation work entirely.

### Shadow Vocabulary

- **shadow-xs** on outline buttons and switches: barely-there grounding.
- **shadow-sm** on cards and chips: rest elevation.
- **shadow-md / shadow-lg** on popovers, menus, dialogs, sheets: the only
  surfaces allowed to visibly float.

### Named Rules

**The Whisper Shadow Rule.** If a shadow is noticeable at a glance, it is
too strong. Never pair a border with a wide soft shadow on the same
element for decoration; a surface earns lg shadow only by floating above
the flow.

## 5. Components

Precise and quiet: tight radii, hairline borders, instant state changes.
Controls read as instrument switches, not web buttons.

### Buttons

- **Shape:** gently rounded (8px), 32px tall in chrome (sm size).
- **Primary:** ink fill, panel text; hover dims to 90%.
- **Outline:** transparent fill, line border; hover fills with Fill.
- **Ghost:** no border, hover fills with Fill; the default for header
  actions.
- **Focus:** 2px selection-violet ring at 50% opacity, 3px spread;
  identical on every control.
- **Active:** scale 0.96 (motion-safe only).

### Badges / Pills

- **Side pill:** 10% side-color tint, side-color text, full pill, 10px
  bold uppercase tracked. Aff/Neg/Judge on dashboard cards.
- Meaning is never carried by hue alone: pills always carry a text label.

### Cards / Containers

- **Corner Style:** 10px (rounded-lg).
- **Background:** Panel on Canvas.
- **Border:** 1px Line; hover shifts border to muted ink at 50%.
- **Internal Padding:** 20px.

### Inputs / Fields

- **Style:** 1px Line border, panel background, 8px radius, 32px tall.
- **Focus:** selection-violet border plus 3px violet ring at 50%.
- **Invalid:** destructive border and ring.

### Keycap (signature)

The `<Kbd>` element renders chord hints as physical keys: Fill background,
Line border with a 2px bottom edge (reads as a keycap without shadow),
Commit Mono at 11-12px. Used in tooltips, the cheatsheet, and settings
chord chips.

### The Flow Sheet (signature)

Handsontable themed as paper: white ground, light-locked in both themes,
speech headers in bold Aff Blue / Neg Red, cell selection in Selection
Violet, highlighter swipes in Highlight Yellow. The sheet is the product;
every other component exists to stay out of its way.

## 6. Do's and Don'ts

### Do:

- **Do** route every color through a token in `globals.css`; reuse an
  existing role before adding one.
- **Do** keep the violet focus language identical everywhere: 2px outline
  on bare elements, ring-ring/50 on primitives, violet accent in the grid.
- **Do** pair every meaning-carrying hue with a text label, position, or
  border so meaning survives color-blindness ("Aff" text next to the blue
  dot, never the dot alone).
- **Do** keep interactions reachable from the keyboard first; a
  mouse-only affordance is a regression.
- **Do** honor `prefers-reduced-motion`; state-conveying transitions stay
  in the 150-250ms ease-out band.

### Don't:

- **Don't** build "generic SaaS dashboard" surfaces: no card grids as
  filler, no gradient hero-metric panels, no marketing chrome
  (PRODUCT.md anti-reference, verbatim).
- **Don't** add "heavy / chrome-laden UI": no toolbar thickets, no
  modal-heavy flows, no mouse-first affordances that slow flowing
  (PRODUCT.md anti-reference).
- **Don't** go "colorful / playful": color is reserved and meaningful,
  never decorative; no rainbow data viz (PRODUCT.md anti-reference).
- **Don't** theme the flow sheet or the settings font sample; they are
  paper.
- **Don't** set `color` inside `::selection`; dark-theme foreground on a
  light-locked surface vanishes.
- **Don't** use light-gray body text on tinted near-white; muted ink
  (oklch L 0.49) is the floor.
