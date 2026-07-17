# 001 - Retune the Radix surfaces: one curve, tighter budgets, asymmetric exits, reduced-motion gating

- **Status**: TODO
- **Commit**: 6dc4cbdfaad9
- **Severity**: HIGH
- **Category**: Easing & duration / Cohesion & tokens / Physicality & origin / Accessibility
- **Estimated scope**: 6 files (globals.css, dialog.tsx, sheet.tsx, dropdown-menu.tsx, select.tsx, tooltip.tsx), class-string edits only

## Problem

The app has two motion dialects. Motion-the-library speaks a single shared curve
(`MOTION_TRANSITION` in `src/components/MotionRoot.tsx:6-9`: 200ms
`cubic-bezier(0.25, 1, 0.5, 1)`), but every Radix primitive speaks tw-animate-css
defaults: unspecified (weak) easing, durations from 150ms to 500ms, and one
surface using `ease-in-out` on an entrance. None of the keyframe-driven movement
is gated on `prefers-reduced-motion` (the app-level
`MotionConfig reducedMotion="user"` only covers Motion components), and the
tooltip is the one trigger-anchored surface that scales from center instead of
its trigger.

Current code:

```tsx
// src/components/ui/sheet.tsx:41 - current (enter 500ms, exit 300ms, ease-in-out)
"transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:duration-500 data-[state=open]:slide-in-from-right",
```

```tsx
// src/components/ui/dialog.tsx:63 - current (200ms both directions, default easing)
"fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-card p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
```

```tsx
// src/components/ui/dialog.tsx:35 - current overlay
"fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
```

```tsx
// src/components/ui/sheet.tsx:21 - current overlay
"fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
```

```tsx
// src/components/ui/tooltip.tsx:43 - current (no transform-origin; dropdown and select already set theirs)
"bg-foreground text-background z-50 flex items-center gap-2 rounded-md px-2 py-1 text-xs shadow-md select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
```

```tsx
// src/components/ui/dropdown-menu.tsx:36 - current (no easing/duration classes; ungated zoom + slide)
"z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
```

`src/components/ui/dropdown-menu.tsx:204` (SubContent) and
`src/components/ui/select.tsx:52` (SelectContent) carry the same pattern as
dropdown-menu.tsx:36.

The easing token exists but is unreachable from Tailwind utilities:

```css
/* src/app/globals.css:71-73 - current (plain :root var, no Tailwind utility) */
    /* Motion: natural deceleration for state-conveying transitions
       (drag, flash). */
    --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
```

Why it matters: a 500ms `ease-in-out` drawer delays the initial movement, the
exact moment the user watches; five surfaces with three different easing
vocabularies read as three different products; and reduced-motion users still
get the full slide/zoom movement.

## Target

- One curve everywhere: `--ease-out-quart` becomes a Tailwind theme token so the
  `ease-out-quart` utility exists, and every Radix surface uses it.
- Duration budgets: dialog enter 200ms / exit 150ms; sheet enter 250ms / exit
  200ms; dropdown and select enter 150ms (tw-animate default) / exit 100ms;
  tooltip enter 150ms (default) / exit 100ms.
- Movement (zoom, slide) gated behind `motion-safe:`; opacity fades stay
  ungated so reduced-motion users keep feedback. The sheet, whose only
  animation is a slide, gets `motion-reduce:` fades as the substitute.
- Tooltip scales from its trigger via
  `origin-(--radix-tooltip-content-transform-origin)`.

tw-animate-css reads `--tw-duration` and `--tw-ease` (set by Tailwind's
`duration-*` and `ease-*` utilities) for `animate-in`/`animate-out`, which is
why the existing `duration-200` on dialog already works and why `ease-out-quart`
will apply to keyframe animations too.

## Repo conventions to follow

- Design tokens live in `src/app/globals.css`; the file's header comment says
  color literals outside it are a bug. Extend the existing `@theme` block at
  `src/app/globals.css:4-8`.
- Exemplar for trigger-anchored origin: `src/components/ui/dropdown-menu.tsx:36`
  uses `origin-(--radix-dropdown-menu-content-transform-origin)`.
- Exemplar for reduced-motion gating: `src/components/ui/button.tsx:8` uses
  `motion-safe:active:scale-[0.96]`.
- Comments state present-tense facts, plain ASCII, no history narration.

## Steps

1. `src/app/globals.css`: move the easing token into the `@theme` block so
   Tailwind emits both the `:root` variable and an `ease-out-quart` utility.
   Delete the old `:root` declaration at lines 71-73 (Tailwind v4 `@theme`
   variables are emitted on `:root` automatically).

   ```css
   @theme {
       --font-sans: var(--font-ibm-plex-sans);
       --font-mono: var(--font-commit-mono);
       --font-flow: var(--font-dm-sans);
       /* The app's one motion curve; MOTION_TRANSITION in MotionRoot.tsx mirrors it. */
       --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
   }
   ```

2. `src/components/ui/dialog.tsx:35` (DialogOverlay): replace the quoted class
   string with:

   ```
   "fixed inset-0 z-50 bg-black/50 ease-out-quart data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150"
   ```

3. `src/components/ui/dialog.tsx:63` (DialogContent): replace the quoted class
   string with:

   ```
   "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-card p-6 shadow-lg outline-none ease-out-quart duration-200 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95 sm:max-w-lg"
   ```

4. `src/components/ui/sheet.tsx:21` (SheetOverlay): replace the quoted class
   string with:

   ```
   "fixed inset-0 z-50 bg-black/30 ease-out-quart data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150"
   ```

5. `src/components/ui/sheet.tsx:41` (SheetContent): replace the second quoted
   class string (the one that currently starts `"transition ease-in-out ..."`)
   with:

   ```
   "ease-out-quart data-[state=open]:animate-in data-[state=open]:duration-250 motion-safe:data-[state=open]:slide-in-from-right motion-reduce:data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:duration-200 motion-safe:data-[state=closed]:slide-out-to-right motion-reduce:data-[state=closed]:fade-out-0"
   ```

   Note the stray `transition ease-in-out` prefix is deleted entirely; these
   are keyframe animations, not transitions, so those two classes only fought
   the animation easing.

6. `src/components/ui/tooltip.tsx:43` (TooltipContent): replace the quoted
   class string with:

   ```
   "bg-foreground text-background z-50 flex items-center gap-2 rounded-md px-2 py-1 text-xs shadow-md select-none origin-(--radix-tooltip-content-transform-origin) ease-out-quart animate-in fade-in-0 motion-safe:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100"
   ```

7. `src/components/ui/dropdown-menu.tsx:36` (DropdownMenuContent): in the
   quoted class string, keep everything before the animation classes and
   replace the animation classes so the full string becomes:

   ```
   "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md ease-out-quart data-[state=closed]:duration-100 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95"
   ```

8. `src/components/ui/dropdown-menu.tsx:204` (DropdownMenuSubContent): apply
   the identical transformation - add `ease-out-quart` and
   `data-[state=closed]:duration-100`, prefix every `slide-in-from-*`,
   `zoom-in-95`, and `zoom-out-95` class with `motion-safe:`, and leave the
   `fade-*` and `animate-*` classes ungated.

9. `src/components/ui/select.tsx:52` (SelectContent): apply the identical
   transformation as step 7 (add `ease-out-quart` and
   `data-[state=closed]:duration-100`; `motion-safe:` on all `slide-in-from-*`
   and `zoom-*` classes; fades stay ungated).

## Boundaries

- Do NOT touch any component outside the six files listed.
- Do NOT change markup, props, or behavior - class strings and the globals
  token block only.
- Do NOT add dependencies.
- Do NOT modify `MotionRoot.tsx` (it already matches the curve).
- If a quoted "current" string does not match the file, STOP and report.

## Verification

- **Mechanical**: `npm run lint` and `npm test` pass; `npm run build` succeeds.
  Grep check: `grep -rn "ease-in-out" src/components/ui/` returns nothing.
- **Feel check** (run `npm run dev`):
  - Open a flow card's detail drawer on the dashboard: it slides in noticeably
    quicker than before with a fast start and soft landing, and closes slightly
    faster than it opens.
  - Open a dropdown (flow card menu) and a tooltip: both scale from the side
    where their trigger sits, never from center.
  - In DevTools > Rendering, enable "Emulate prefers-reduced-motion": dialogs,
    dropdowns, selects, and tooltips still fade in and out but no longer zoom
    or slide; the detail drawer fades instead of sliding.
  - In the Animations panel at 10% speed, confirm dialog exit is visibly
    shorter than its entrance.
- **Done when**: all six files carry `ease-out-quart`, every zoom/slide class
  is behind `motion-safe:`, and the feel checks above hold.
