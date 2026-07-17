# 003 - Critically damp the update chip entrance

- **Status**: TODO
- **Commit**: 6dc4cbdfaad9
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, 1 line removed

## Problem

The update chip is the only bouncy animation in the product. Its spring
(`stiffness: 500, damping: 30` on unit mass gives a damping ratio around 0.67)
visibly overshoots, while every other animation in the app rides the shared
critically-damped-feeling `MOTION_TRANSITION` curve. Overshoot is earned by
user momentum (a flick, a throw); a chip that appears on its own has none, and
the app's register is a crisp instrument, not a playful toy.

```tsx
// src/components/update/UpdateChip.tsx:30-33 - current
initial={{ opacity: 0, y: 8, scale: 0.96 }}
animate={{ opacity: 1, y: 0, scale: 1 }}
exit={{ opacity: 0, y: 8 }}
transition={{ type: "spring", stiffness: 500, damping: 30 }}
```

## Target

Remove the `transition` prop entirely. The chip then inherits the app-wide
default from `MotionConfig` in `src/components/MotionRoot.tsx:6-9` (200ms,
`cubic-bezier(0.25, 1, 0.5, 1)`): same entrance shape, no overshoot, one motion
vocabulary. The `initial`/`animate`/`exit` values stay exactly as they are
(scale 0.96 + opacity is already correct physicality - never from scale(0)).

## Repo conventions to follow

- `src/components/flow/SaveStatus.tsx:80-84` animates with no `transition`
  prop and inherits the MotionConfig default - imitate that.

## Steps

1. `src/components/update/UpdateChip.tsx:33`: delete the line
   `transition={{ type: "spring", stiffness: 500, damping: 30 }}`.

## Boundaries

- Do NOT change the initial/animate/exit values, the class names, or any
  behavior.
- Do NOT touch any other file.
- If the transition prop is not exactly as quoted, STOP and report.

## Verification

- **Mechanical**: `npm run lint` and `npm test` pass.
- **Feel check**: hard to trigger live (requires a downloaded update).
  Temporarily force `ready` to true in a dev build (do not commit), reload, and
  confirm the chip rises and fades in with no bounce past its resting point,
  settling in about 200ms. In the Animations panel at 10% speed, confirm the
  chip never travels above its final position.
- **Done when**: the chip has no `transition` prop and inherits the shared
  curve.
