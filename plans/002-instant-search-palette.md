# 002 - Open the search palette instantly (no animation on a keyboard surface)

- **Status**: TODO
- **Commit**: 6dc4cbdfaad9
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 2 files (dialog.tsx, SearchPalette.tsx)
- **Depends on**: plan 001 (rewrites the same dialog.tsx class strings; execute 001 first)

## Problem

The command/search palette (`src/components/palette/SearchPalette.tsx`) is a
keyboard-summoned, many-times-per-day surface, and it inherits the shared
Dialog's enter/exit animation (zoom + fade, plus an overlay fade). The
frequency rule: keyboard-initiated, 100+/day actions get no animation, ever -
any animation on this path reads as latency (Raycast opens with none). The
palette is also top-anchored at `top-[12vh]` while the dialog zoom emanates
from center, so the motion origin is wrong on top of being unwanted.

The palette mounts DialogContent at `src/components/palette/SearchPalette.tsx:164`:

```tsx
// src/components/palette/SearchPalette.tsx:164-177 - current (abridged)
<DialogContent
    showCloseButton={false}
    aria-label={label}
    data-testid="search-palette"
    ...
    className="bg-popover top-[12vh] w-full max-w-[560px] translate-y-0 gap-0 overflow-hidden rounded-md border p-0 shadow-2xl"
>
```

The animation classes live in the shared primitive
(`src/components/ui/dialog.tsx` DialogOverlay and DialogContent), so they
cannot be removed via `className`; the primitive needs an opt-out.

## Target

`DialogContent` accepts `animated?: boolean` (default `true`). When `false`,
neither the overlay nor the content emits any `animate-in`/`animate-out`
classes: the palette appears and disappears on the same frame as the
keypress. All other dialogs (confirm dialogs, keybindings cheatsheet) keep the
default and are unaffected.

## Repo conventions to follow

- `DialogContent` already takes a custom boolean prop with a default:
  `showCloseButton = true` at `src/components/ui/dialog.tsx:46`. Add `animated`
  the same way.
- Comments state a why in present tense, plain ASCII.

## Steps

These steps assume plan 001 has been executed (class strings below are the
post-001 versions).

1. `src/components/ui/dialog.tsx` - DialogOverlay: accept and honor `animated`:

   ```tsx
   function DialogOverlay({
       className,
       animated = true,
       ...props
   }: React.ComponentProps<typeof DialogPrimitive.Overlay> & {
       animated?: boolean;
   }) {
       return (
           <DialogPrimitive.Overlay
               data-slot="dialog-overlay"
               className={cn(
                   "fixed inset-0 z-50 bg-black/50",
                   animated &&
                       "ease-out-quart data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
                   className,
               )}
               {...props}
           />
       );
   }
   ```

2. `src/components/ui/dialog.tsx` - DialogContent: accept `animated`, forward
   it to the overlay, and gate the content animation classes:

   ```tsx
   function DialogContent({
       className,
       children,
       showCloseButton = true,
       animated = true,
       ...props
   }: React.ComponentProps<typeof DialogPrimitive.Content> & {
       showCloseButton?: boolean;
       // Keyboard-summoned surfaces (search palette) opt out of enter/exit
       // animation entirely: motion on a many-times-a-day path reads as latency.
       animated?: boolean;
   }) {
       return (
           <DialogPortal data-slot="dialog-portal">
               <DialogOverlay animated={animated} />
               <DialogPrimitive.Content
                   ...
                   className={cn(
                       "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-card p-6 shadow-lg outline-none sm:max-w-lg",
                       animated &&
                           "ease-out-quart duration-200 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95",
                       className,
                   )}
                   ...
   ```

   Keep everything else in the function (onCloseAutoFocus handler, close
   button) exactly as is. Note `sm:max-w-lg` stays in the static string.

3. `src/components/palette/SearchPalette.tsx:164` - pass the opt-out:

   ```tsx
   <DialogContent
       showCloseButton={false}
       animated={false}
       ...
   ```

## Boundaries

- Do NOT touch KeybindingsCheatsheet, ConfirmDialog, or any other DialogContent
  caller - they keep the default animation.
- Do NOT change SearchPalette behavior, focus handling, or markup beyond adding
  the one prop.
- Do NOT add dependencies.
- If dialog.tsx does not match the post-001 shape, STOP and report (001 has
  not been executed).

## Verification

- **Mechanical**: `npm run lint` and `npm test` pass.
- **Feel check** (run `npm run dev`, open a flow):
  - Press the palette shortcut: palette and scrim are simply there on the next
    frame - no zoom, no fade, no perceptible delay. Escape dismisses it just as
    instantly.
  - Open the `?` keybindings cheatsheet and a delete confirm dialog: both still
    animate as before (200ms in / 150ms out).
- **Done when**: the palette opens and closes with zero animation while every
  other dialog is unchanged.
