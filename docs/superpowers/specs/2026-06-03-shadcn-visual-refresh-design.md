# Shadcn Visual Refresh — Design Spec

**Date:** 2026-06-03  
**Branch:** export-system (base for this work)  
**Status:** Approved

---

## Goal

Upgrade the app's visual quality by adopting shadcn/ui components and Tailwind CSS. The flow grid
itself is untouched; the refresh targets the chrome — header, sidebar, setup form, and overlay
panels.

---

## Decisions

| Decision            | Choice                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| Visual palette      | Clean Zinc (shadcn default: zinc-50 bg, white surfaces, zinc-200 borders)  |
| Body font           | DM Sans (variable, Google Fonts)                                           |
| Monospace font      | DM Mono — used for column headers, sidebar group labels, `.label` elements |
| Styling methodology | Full Tailwind migration for all component chrome                           |
| Flow grid styling   | Stays as global CSS — no Tailwind                                          |

---

## Architecture

### What gets added

- **`tailwindcss` v4** (via `@tailwindcss/postcss`) — CSS-first, no `tailwind.config.ts` needed;
  theme lives in `globals.css` via `@theme {}`
- **shadcn CLI** (latest, Tailwind v4 compatible) — generates components into `src/components/ui/`
- **shadcn components**: `button`, `input`, `label`, `card`, `dropdown-menu`, `sheet`, `dialog`
- **Fonts via `next/font/google`**: `DM_Sans` + `DM_Mono`, exposed as CSS variables, zero FOUT

### What stays as global CSS (untouched)

The flow grid block in `globals.css` is preserved exactly:

- `.flow`, `.flow th`, `.flow td`
- `.side-aff`, `.side-neg`
- `.cell-sel`, `.cell-drop`, `.cell-input`
- `.badge-drop`, `.arg-num`, `.arg-parent`, `.status-good`, `.dash`
- All print styles (`@media print`, `.print-only`, `.no-print`)

### What moves to Tailwind + shadcn

These classes are removed from `globals.css` because components take over:

- `.btn`, `.btn-primary`
- `.panel`, `.panel-header`
- `.label`, `.muted`, `.pill`

---

## Theme Configuration

### shadcn CSS variables (`globals.css` `:root`)

shadcn v4 uses OKLCH CSS variables. Run `shadcn init` and select the **Zinc** theme — it generates
the correct `:root` block automatically. The key semantic mappings are:

| shadcn token         | maps to  | our token           |
| -------------------- | -------- | ------------------- |
| `--background`       | zinc-50  | `--bg`              |
| `--foreground`       | zinc-900 | `--ink`             |
| `--card`             | white    | `--panel`           |
| `--border`           | zinc-200 | `--line`            |
| `--primary`          | zinc-900 | (button background) |
| `--muted-foreground` | zinc-500 | `--muted`           |
| `--ring`             | violet   | `--sel`             |
| `--radius`           | 0.5rem   | —                   |

After `shadcn init` generates the block, verify these mappings hold and adjust if the generated
values drift. The generated values are OKLCH — do not hand-edit them to hex.

Semantic tokens stay as-is below the shadcn block (shadcn does not touch them):

```css
--aff: #1d4ed8;
--neg: #c0271f;
--sel: #7c3aed;
--warn: #b45309;
--good: #047857;
```

### Tailwind v4 theme extensions (`globals.css` `@theme` block)

Tailwind v4 is CSS-first — custom tokens go in an `@theme {}` block, no `tailwind.config.ts`
required:

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-dm-sans);
  --font-mono: var(--font-dm-mono);

  --color-aff: #1d4ed8;
  --color-neg: #c0271f;
  --color-sel: #7c3aed;
  --color-warn: #b45309;
  --color-good: #047857;
}
```

This makes `text-aff`, `border-neg`, `bg-sel/10`, `font-mono`, `font-sans` etc. available as
Tailwind utilities. The `--color-*` prefix is required for Tailwind v4 to generate color utilities.

### Font wiring (`layout.tsx`)

```tsx
import { DM_Sans, DM_Mono } from 'next/font/google';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

// Apply both variables to <html>
<html className={`${dmSans.variable} ${dmMono.variable}`}>
```

---

## Component Changes

### `RoundHeader`

- Inline styles → Tailwind layout
  (`flex items-center justify-between h-12 px-4 bg-card border-b border-border`)
- `<button>` tags → shadcn `Button`
  - Export: `variant="outline" size="sm"`
  - Import: `variant="outline" size="sm"`
  - New round: `variant="ghost" size="sm"`

### `ExportMenu`

- **Entire component replaced** by shadcn `DropdownMenu`
- Current DIY click-outside + keydown handling removed
- Gets: keyboard navigation, focus trapping, Radix animation, WAI-ARIA menu role out of the box

### `Sidebar`

- Inline styles → Tailwind layout
- Sheet row `<button>` → `Button variant="ghost"` with active state via conditional
  `bg-zinc-100 font-semibold` classes
- `+ Aff` / `+ Neg` → `Button variant="outline" size="sm"`
- Group label (currently `.label`) → `font-mono text-[9px] uppercase tracking-widest text-zinc-400`

### `RoundSetup`

- Setup card → shadcn `Card` + `CardHeader` + `CardContent`
- `CardHeader` renders "New Round" title
- Each field → shadcn `Label` + `Input`
- Role / format toggle buttons → shadcn `Button` with active state toggling between
  `variant="default"` and `variant="outline"`
- Submit → `Button variant="default"` (full width)
- Overlay wrapper stays as Tailwind flex centering

### `SettingsPanel`

- Currently a custom animated div sliding in from the right
- Replaced by shadcn `Sheet` (side="right")
- Gets: overlay backdrop, focus trap, Escape to close, animation — all automatic

### `KeybindingsCheatsheet`

- Currently a custom modal div
- Replaced by shadcn `Dialog`
- Gets: backdrop, focus trap, Escape to close

### `QuickSwitcher`

- Stays custom (keyboard-driven command palette with bespoke layout)
- Inline styles → Tailwind classes only; no shadcn component
- Uses `font-mono` for shortcut display

### `Workspace` / `AppRoot` / `PrintView`

- Layout-only inline styles converted to Tailwind (`flex flex-col h-screen`, `flex-1 min-h-0`,
  `overflow-auto`, etc.)
- No visual change

### `FlowGrid` / `GridCell`

- No changes — still relies on `.flow`, `.cell-sel`, `.cell-drop`, `.cell-input` global CSS classes

---

## Implementation Order

1. **Install Tailwind** — add `tailwindcss`, `@tailwindcss/postcss`; create `tailwind.config.ts`;
   add `@import "tailwindcss"` to `globals.css`
2. **Run shadcn init** — sets up `components.json`, `src/lib/utils.ts` (`cn()`), installs shadcn CSS
   variable block into `globals.css`
3. **Wire fonts** — add `DM_Sans` + `DM_Mono` in `layout.tsx`; update Tailwind `fontFamily` config
4. **Migrate `globals.css`** — strip `.btn`, `.btn-primary`, `.panel`, `.panel-header`, `.label`,
   `.muted`, `.pill`; keep flow grid block intact
5. **Install shadcn components** — `button` → `input` + `label` → `card` → `dropdown-menu` → `sheet`
   → `dialog`
6. **Rewrite components** in this order:
   - `RoundSetup` (most visual impact, isolated surface)
   - `RoundHeader` + `ExportMenu` (header chrome)
   - `Sidebar`
   - `SettingsPanel` → `Sheet`
   - `KeybindingsCheatsheet` → `Dialog`
   - `QuickSwitcher`
7. **Clean up layout shells** — `Workspace`, `AppRoot` inline styles → Tailwind
8. **Verify flow grid** — confirm `.flow` CSS still applies, no regressions in cell editing /
   selection / drop states
9. **Test + lint pass**

---

## Out of Scope

- Dark mode (light-mode only, per project decision)
- Flow grid aesthetic changes (column widths, cell padding, type size)
- Any model / store / export logic changes
- Print layout changes
