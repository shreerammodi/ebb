# 004 - Tighten the dashboard grouped/flat view swap

- **Status**: TODO
- **Commit**: 6dc4cbdfaad9
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file, 2 small prop additions

## Problem

Toggling the dashboard's organize (grouped/flat) switch crossfades the two
list trees under `AnimatePresence mode="wait"`. With `mode="wait"`, the exit
fade fully completes before the enter fade begins, and both phases inherit the
app default 200ms, so the swap takes about 400ms with a stretch of blank canvas
in the middle. For a deliberate view toggle that should feel like flipping a
switch, that reads as lag.

```tsx
// src/components/dashboard/Dashboard.tsx:205-212 - current (abridged)
<AnimatePresence mode="wait" initial={false}>
    {groups ? (
        <m.div
            key="grouped"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
```

The flat branch (`key="flat"`, around line 251) has the identical shape.

`mode="wait"` itself is correct here - the two trees have different layouts, so
overlapping them would cause a visible height jump. Keep it; shorten the
phases.

## Target

Both wrapper divs get an explicit fast transition so the full swap (exit +
enter) lands around 200ms total:

```tsx
transition={{ duration: 0.1 }}
```

The easing is inherited from MotionConfig and irrelevant for a pure
short-opacity fade.

## Repo conventions to follow

- Per-element transition overrides are passed inline as a `transition` prop on
  the `m.` element (see `src/components/update/UpdateChip.tsx` for the
  pattern).

## Steps

1. `src/components/dashboard/Dashboard.tsx`: on the `m.div key="grouped"`
   wrapper (line 207), add `transition={{ duration: 0.1 }}` alongside the
   existing initial/animate/exit props.
2. Same file: on the `m.div key="flat"` wrapper (around line 251), add the
   identical `transition={{ duration: 0.1 }}`.

## Boundaries

- Do NOT touch the inner per-card `AnimatePresence mode="popLayout"` blocks or
  the per-card `m.div layout` wrappers - the card filter/reorder animations are
  already correct.
- Do NOT remove `mode="wait"` or `initial={false}`.
- Do NOT touch any other file.
- If the two wrappers do not match the quoted shape, STOP and report.

## Verification

- **Mechanical**: `npm run lint` and `npm test` pass.
- **Feel check**: on the dashboard with several flows, toggle the organize
  switch rapidly. The swap should read as a quick blink (about 200ms
  total) with no long blank gap, and spamming the switch should never wedge the
  list in a half-faded state.
- **Done when**: both view wrappers carry the 0.1s transition and the toggle
  feels immediate.
