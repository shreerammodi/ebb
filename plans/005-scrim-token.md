# 005 - One scrim token for every overlay

- **Status**: DONE
- **Commit**: 6dc4cbdfaad9
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 3 files (globals.css, dialog.tsx, sheet.tsx), tiny edits
- **Depends on**: plan 001 (rewrites the same overlay class strings; execute 001 first)

## Problem

The two modal overlays dim by different amounts via raw literals: dialogs use
`bg-black/50` (`src/components/ui/dialog.tsx:35`), the sheet uses `bg-black/30`
(`src/components/ui/sheet.tsx:21`). Scrim weight is depth language - the same
class of blocking surface should dim the world by the same amount - and
`globals.css` states that color literals outside it are a bug. There is no
recorded reason for the difference, so it reads as drift, not design.

## Target

A single `--scrim` token in `globals.css`, consumed as `bg-scrim` by both
overlays. Value: `oklch(0 0 0 / 40%)` - between the two current weights, dark
enough to signal modality behind a centered dialog, light enough not to
entomb the dashboard behind the detail drawer.

## Repo conventions to follow

- Tokens are declared in `:root` in `src/app/globals.css` and mapped to a
  Tailwind color in the `@theme inline` block (see `--color-sel: var(--sel);`
  at `src/app/globals.css:139` for the pattern). The dark theme overrides only
  what must change; a scrim can stay identical in both themes, so no `.dark`
  override is needed.

## Steps

1. `src/app/globals.css`: in `:root`, next to the other surface tokens, add:

   ```css
   /* Dimming layer behind modal surfaces (dialogs, drawers). */
   --scrim: oklch(0 0 0 / 40%);
   ```

2. Same file, in the `@theme inline` block, add:

   ```css
   --color-scrim: var(--scrim);
   ```

3. `src/components/ui/dialog.tsx:35` (DialogOverlay): replace `bg-black/50`
   with `bg-scrim`.

4. `src/components/ui/sheet.tsx:21` (SheetOverlay): replace `bg-black/30`
   with `bg-scrim`.

## Boundaries

- Do NOT change any other color or class.
- Do NOT touch the animation classes on the same lines (owned by plans 001 and
  002).
- If either overlay no longer contains its quoted `bg-black/*` literal, STOP
  and report.

## Verification

- **Mechanical**: `npm run lint` and `npm test` pass. Grep check:
  `grep -rn "bg-black/" src/components/ui/` returns nothing.
- **Feel check**: open a confirm dialog and the dashboard detail drawer in both
  light and dark themes; both dim the background identically and text behind
  the scrim remains readable but clearly deactivated.
- **Done when**: both overlays use `bg-scrim` and the token exists in
  globals.css.
