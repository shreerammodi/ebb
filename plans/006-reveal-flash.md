# 006 - Flash the landing cell after a search-palette jump

- **Status**: TODO
- **Commit**: 6dc4cbdfaad9
- **Severity**: MEDIUM (additive - missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (HotGrid.tsx), ~10 lines

## Problem

Jumping to a search result teleports: `revealCell` switches sheets, scrolls the
grid, and moves the selection in a single frame
(`src/components/flow/HotGrid.tsx:321-329`). After a cross-sheet jump the user
has lost all spatial context and must scan the viewport for the thin selection
border to find where they landed. A one-shot highlight decay on the landing
cell anchors the eye - state indication, the classic "you are here" flash.

Notably, the easing token's own comment in globals.css already names "flash" as
an intended use, but no flash exists anywhere in the codebase.

```tsx
// src/components/flow/HotGrid.tsx:322-329 - current
useEffect(() => {
    if (!revealTarget || revealTarget.sheetId !== sheetId) return;
    const id = requestAnimationFrame(() => {
        const hot = hotRef.current?.hotInstance;
        hot?.selectCell(revealTarget.row, revealTarget.col);
    });
    return () => cancelAnimationFrame(id);
}, [revealTarget, sheetId]);
```

## Target

After `selectCell`, run a one-shot WAAPI animation on the landing cell's TD:
background decays from selection-violet at 20% to transparent over 600ms on the
app curve. WAAPI keeps it self-cleaning (no class bookkeeping, no state); if
Handsontable re-renders mid-flash and swaps the TD, the flash simply ends
early, which is acceptable.

The color literal is allowed here by the globals.css exception: the flow sheet
is a light-locked surface, and `rgba(124, 58, 237, 0.2)` is the sheet's pinned
selection violet (`--ht-accent-color: #7c3aed` in `html .ht-theme-main`) at 20%
alpha - the same language as the selection border that just arrived there.

This flash is color-only feedback with no movement, so it stays under
prefers-reduced-motion (reduced motion keeps comprehension-aiding color/opacity
changes).

## Repo conventions to follow

- One-off cell paint driven from grid code, not cellMeta, is the established
  pattern - see the move-mode tint comment in `src/app/globals.css` (class
  `cell-moving`, painted by afterRenderer, "never reaches a saved sheet").
- Comments state a why in present tense, plain ASCII, and use the model's
  vocabulary ("cell", not "square").

## Steps

1. `src/components/flow/HotGrid.tsx`: extend the reveal effect body:

   ```tsx
   useEffect(() => {
       if (!revealTarget || revealTarget.sheetId !== sheetId) return;
       const id = requestAnimationFrame(() => {
           const hot = hotRef.current?.hotInstance;
           if (!hot) return;
           hot.selectCell(revealTarget.row, revealTarget.col);
           // A jump teleports the viewport, so the landing cell announces
           // itself: a one-shot decay from the sheet's selection violet.
           // WAAPI on the live TD self-cleans; a mid-flash re-render that
           // swaps the TD just ends the flash early.
           hot.getCell(revealTarget.row, revealTarget.col)?.animate(
               [
                   { backgroundColor: "rgba(124, 58, 237, 0.2)" },
                   { backgroundColor: "transparent" },
               ],
               { duration: 600, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
           );
       });
       return () => cancelAnimationFrame(id);
   }, [revealTarget, sheetId]);
   ```

2. Possible drift to handle: `hot.getCell(row, col)` returns null when the cell
   has not been rendered yet. `selectCell` scrolls the viewport and renders
   synchronously in current Handsontable, so the direct call is expected to
   work. If the feel check shows no flash on long-distance jumps, wrap the
   `getCell(...)?.animate(...)` call in one more `requestAnimationFrame` so it
   runs a frame after the scroll-triggered render. Do not add Handsontable
   hooks for this.

## Boundaries

- Do NOT touch the speech-switch effect below the reveal effect, the
  sheet-switch effect above it, or any other part of HotGrid.
- Do NOT store flash state anywhere (no cellMeta, no store fields, no CSS
  classes) - the WAAPI animation is the entire mechanism.
- Do NOT gate the flash behind prefers-reduced-motion.
- If the reveal effect does not match the quoted current code, STOP and report.

## Verification

- **Mechanical**: `npm run lint` and `npm test` pass.
- **Feel check** (run `npm run dev`, open a flow with several sheets and filled
  cells):
  - Search a cell on another sheet and press Enter: the grid lands with the
    target cell glowing violet, fading to nothing in about half a second.
  - Jump to a far-off-screen cell on the same sheet: flash still appears after
    the scroll.
  - Press Escape/keep typing immediately after the jump: the flash never
    blocks input or delays the editor.
  - At 10% speed in the Animations panel, the decay starts fast and eases out
    (no linear feel).
- **Done when**: every palette jump visibly marks its landing cell and nothing
  else about reveal behavior changed.
