# Shadcn Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the app's chrome (header, sidebar, setup form, overlays) to Tailwind v4 + shadcn/ui (Clean Zinc palette, DM Sans body font, DM Mono for labels/column headers), leaving the flow grid CSS untouched.

**Architecture:** Install Tailwind v4 (CSS-first config via `@theme`) and shadcn (Zinc theme), wire DM Sans + DM Mono via `next/font/google`, then rewrite each component one at a time from the outside in. The flow grid block in `globals.css` (`.flow`, `.cell-*`, `.badge-drop`, etc.) is never touched.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui (Zinc), Radix UI primitives, DM Sans + DM Mono (Google Fonts via `next/font`), Zustand, Vitest + Testing Library.

**Note on SettingsPanel:** It is migrated to Tailwind classes only — not shadcn Dialog — because its onPanelKeyDown handler dispatches native DOM events that the test suite fires directly on the panel element. Wrapping in Radix Dialog would require significant test rearchitecting with no visual benefit.

---

### Task 1: Install Tailwind v4 + configure PostCSS

**Files:**
- Create: `postcss.config.mjs`
- Modify: `package.json` (via npm install)
- Modify: `src/app/globals.css` (add import)

- [ ] **Step 1: Install Tailwind v4 packages**

```bash
npm install tailwindcss @tailwindcss/postcss
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create PostCSS config**

Create `postcss.config.mjs` at the repo root:

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
export default config;
```

- [ ] **Step 3: Add Tailwind import to globals.css**

Add this as the very first line of `src/app/globals.css`, before the existing comment:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Verify the build compiles**

```bash
npm run build
```

Expected: exits 0. If you see PostCSS errors, confirm `postcss.config.mjs` is at the repo root (not inside `src/`).

- [ ] **Step 5: Run tests to verify nothing broke**

```bash
npm test
```

Expected: all tests pass. Tailwind adds no runtime behavior.

- [ ] **Step 6: Commit**

```bash
git add postcss.config.mjs package.json package-lock.json src/app/globals.css
git commit -m "build: add Tailwind v4 via @tailwindcss/postcss"
```

---

### Task 2: Initialize shadcn + install components

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/dialog.tsx`
- Modify: `src/app/globals.css` (shadcn appends `:root` variables)
- Modify: `package.json` (Radix deps, clsx, tailwind-merge, lucide-react)

- [ ] **Step 1: Run shadcn init**

```bash
npx shadcn@latest init
```

Answer the prompts:
- Which style? → **Default**
- Which color? → **Zinc**
- Use CSS variables? → **Yes**

This writes `components.json`, creates `src/lib/utils.ts` with the `cn()` helper, and appends a `:root` CSS variable block to `globals.css`.

- [ ] **Step 2: Install the six components we need**

```bash
npx shadcn@latest add button input label card dropdown-menu dialog
```

This creates the six files under `src/components/ui/` and installs any missing Radix packages.

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/utils.ts src/components/ui/ src/app/globals.css package.json package-lock.json
git commit -m "build: init shadcn (Zinc) + install button/input/label/card/dropdown/dialog"
```

---

### Task 3: Wire DM Sans + DM Mono fonts

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css` (add `@theme` block)

- [ ] **Step 1: Update layout.tsx to load the fonts**

Replace the entire contents of `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

export const metadata: Metadata = {
  title: 'Debate Flow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Add @theme block to globals.css**

After the `@import "tailwindcss";` line and before the existing `/* DEBATE FLOW — GLOBAL DESIGN SYSTEM */` comment, add:

```css
@theme {
  --font-sans: var(--font-dm-sans);
  --font-mono: var(--font-dm-mono);

  --color-aff:  #1d4ed8;
  --color-neg:  #c0271f;
  --color-sel:  #7c3aed;
  --color-warn: #b45309;
  --color-good: #047857;
}
```

This makes `font-sans`, `font-mono`, `text-aff`, `border-neg`, `bg-sel/10`, etc. available as Tailwind utilities.

- [ ] **Step 3: Verify fonts load in dev**

```bash
npm run dev
```

Open http://localhost:3000. The UI should render in DM Sans. Column headers in the flow grid still use the existing system font (the `--mono` token) — we'll update those when we migrate `globals.css` in Task 4.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass. `next/font` has no runtime effect on tests (fonts are not loaded in jsdom).

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: wire DM Sans + DM Mono via next/font"
```

---

### Task 4: Migrate globals.css — strip component classes, add legacy aliases

**Files:**
- Modify: `src/app/globals.css`

The flow grid CSS references `var(--bg)`, `var(--panel)`, `var(--ink)`, `var(--muted)`, `var(--line)`. After shadcn init, these tokens exist as `--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`. We add alias declarations so the flow grid CSS keeps working without changes.

- [ ] **Step 1: Add legacy token aliases immediately after the shadcn :root block**

In `globals.css`, find the shadcn-generated `:root { ... }` block. Immediately after its closing `}`, add:

```css
/* Legacy aliases — consumed by .flow and .cell-* rules; do not remove */
:root {
  --bg:    var(--background);
  --panel: var(--card);
  --ink:   var(--foreground);
  --muted: var(--muted-foreground);
  --line:  var(--border);

  /* Semantic color aliases — consumed by .side-aff/.side-neg, .badge-drop, .cell-drop, etc. */
  --aff:  #1d4ed8;
  --neg:  #c0271f;
  --sel:  #7c3aed;
  --warn: #b45309;
  --good: #047857;
}
```

- [ ] **Step 2: Remove the old DESIGN TOKENS :root block**

Delete the entire section 1 (`/* 1. DESIGN TOKENS */`) `:root { ... }` block — the one that defines `--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--aff`, `--neg`, `--sel`, `--warn`, `--good`, `--radius`, `--font`, `--mono`. These are now covered by shadcn (for the base tokens) and `@theme` (for the semantic colors).

Also update the two CSS custom property references in the flow grid that use `var(--font)` and `var(--mono)`:

In `.flow { font-family: var(--font); }`, change to `font-family: var(--font-sans);`

Add `font-family: var(--font-mono);` to the `.flow th { ... }` rule — this gives column headers (1AC, 1NC, 2AC…) DM Mono, matching the design intent.

In `.cell-input`, `font: inherit` already inherits the cell's DM Sans; no change needed.

- [ ] **Step 3: Remove component CSS classes**

Delete these sections entirely from `globals.css`:
- `/* 6. BUTTONS */` — the entire `.btn`, `.btn:hover`, `.btn:active`, `.btn-primary`, `.btn-primary:hover`, `.btn-primary:active` block
- From `/* 5. SIDEBAR / HEADER HELPERS */` — delete `.muted { }`, `.label { }`, `.pill { }`, `.pill.aff { }`, `.pill.neg { }` (keep the section comment)
- From `/* 3. PANEL / SURFACE */` — delete `.panel { }` and `.panel-header { }` (keep the section comment; the `.no-print` and `.print-only` classes stay — they're in section 7)

The flow grid classes (section 4) are untouched. The print section (section 7) is untouched.

- [ ] **Step 4: Update --radius reference**

The shadcn init block defines `--radius`. Verify the flow grid `.flow td`, `.cell-sel` etc. don't reference `--radius` (they use specific px values). If any component elsewhere references `var(--radius)`, update to `var(--radius)` — shadcn defines it, so this still works.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass. The `.badge-drop`, `.cell-sel`, `.cell-drop`, `.cell-input` classes still work because they're unchanged.

- [ ] **Step 6: Verify flow grid renders correctly**

```bash
npm run dev
```

Start a round and confirm: Aff cells have blue left border, Neg cells red, selected cell has violet outline, drop badge is amber. If anything looks wrong, the alias declarations in Step 1 may not resolve correctly — re-check the shadcn `:root` block uses the same variable names.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: strip component CSS classes; add shadcn token aliases for flow grid"
```

---

### Task 5: Migrate RoundSetup

**Files:**
- Modify: `src/components/RoundSetup.tsx`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
npm test -- --reporter=verbose src/components/RoundSetup.test.tsx
```

Expected: all tests pass. Note the test IDs: `round-setup-form`, `role-aff`, `role-neg`, `role-judge`, `format-policy`, `field-opponent`, `field-affName`, `field-negName`, `field-judge`, `submit` — all must be preserved.

- [ ] **Step 2: Replace RoundSetup.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey, FORMAT_PRESETS } from '@/lib/format/presets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Role } from '@/lib/model/types';
import type { PresetKey } from '@/lib/format/presets';

export default function RoundSetup() {
  const createRound = useRoundStore(s => s.createRound);
  const addSheet    = useRoundStore(s => s.addSheet);

  const [role, setRole]             = useState<Role>('aff');
  const [formatKey, setFormatKey]   = useState<PresetKey>('policy');
  const [topic, setTopic]           = useState('');
  const [opponent, setOpponent]     = useState('');
  const [affName, setAffName]       = useState('');
  const [negName, setNegName]       = useState('');
  const [tournament, setTournament] = useState('');
  const [roundLabel, setRoundLabel] = useState('');
  const [judge, setJudge]           = useState('');

  const isJudge = role === 'judge';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const meta = isJudge
      ? { affName: affName.trim() || undefined, negName: negName.trim() || undefined,
          tournament: tournament.trim() || undefined, roundLabel: roundLabel.trim() || undefined }
      : { opponent: opponent.trim() || undefined, tournament: tournament.trim() || undefined,
          roundLabel: roundLabel.trim() || undefined, judge: judge.trim() || undefined };
    createRound({ role, format: makeFormatByKey(formatKey), meta, topic: topic.trim() || undefined });
    addSheet({ title: 'Aff', group: 'aff' });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <Card className="w-full max-w-[440px]" data-testid="round-setup-form">
        <CardHeader className="pb-0">
          <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            New Round
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-4">

            {/* Role */}
            <fieldset className="flex flex-col gap-2">
              <legend className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                Role
              </legend>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Role">
                {(['aff', 'neg', 'judge'] as Role[]).map(r => (
                  <Button
                    key={r}
                    type="button"
                    variant={role === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    data-testid={`role-${r}`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Button>
                ))}
              </div>
            </fieldset>

            {/* Format */}
            <fieldset className="flex flex-col gap-2">
              <legend className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                Format
              </legend>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Format">
                {FORMAT_PRESETS.map(({ key, label }) => (
                  <Button
                    key={key}
                    type="button"
                    variant={formatKey === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormatKey(key)}
                    aria-pressed={formatKey === key}
                    data-testid={`format-${key}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>

            {/* Topic */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rs-topic" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Topic (optional)
              </Label>
              <Input
                id="rs-topic"
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Resolved: …"
              />
            </div>

            {/* Judge-specific fields */}
            {isJudge && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rs-affName" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                    Aff team name
                  </Label>
                  <Input
                    id="rs-affName"
                    type="text"
                    value={affName}
                    onChange={e => setAffName(e.target.value)}
                    placeholder="Aff team"
                    data-testid="field-affName"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rs-negName" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                    Neg team name
                  </Label>
                  <Input
                    id="rs-negName"
                    type="text"
                    value={negName}
                    onChange={e => setNegName(e.target.value)}
                    placeholder="Neg team"
                    data-testid="field-negName"
                  />
                </div>
              </>
            )}

            {/* Competitor-specific field */}
            {!isJudge && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rs-opponent" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                  Opponent
                </Label>
                <Input
                  id="rs-opponent"
                  type="text"
                  value={opponent}
                  onChange={e => setOpponent(e.target.value)}
                  placeholder="Opponent team"
                  data-testid="field-opponent"
                />
              </div>
            )}

            {/* Shared optional fields */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rs-tournament" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Tournament (optional)
              </Label>
              <Input
                id="rs-tournament"
                type="text"
                value={tournament}
                onChange={e => setTournament(e.target.value)}
                placeholder="Tournament name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rs-roundLabel" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Round (optional)
              </Label>
              <Input
                id="rs-roundLabel"
                type="text"
                value={roundLabel}
                onChange={e => setRoundLabel(e.target.value)}
                placeholder="e.g. Round 3, Octos"
              />
            </div>

            {!isJudge && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rs-judge" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                  Judge (optional)
                </Label>
                <Input
                  id="rs-judge"
                  type="text"
                  value={judge}
                  onChange={e => setJudge(e.target.value)}
                  placeholder="Judge name"
                  data-testid="field-judge"
                />
              </div>
            )}

            <Button type="submit" className="mt-1 self-end" data-testid="submit">
              Start Round
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Run RoundSetup tests**

```bash
npm test -- --reporter=verbose src/components/RoundSetup.test.tsx
```

Expected: all tests pass. The `data-testid` attributes are preserved on all interactive elements.

- [ ] **Step 4: Commit**

```bash
git add src/components/RoundSetup.tsx
git commit -m "feat(ui): migrate RoundSetup to shadcn Card/Input/Label/Button + Tailwind"
```

---

### Task 6: Migrate RoundHeader

**Files:**
- Modify: `src/components/RoundHeader.tsx`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
npm test -- --reporter=verbose src/components/RoundHeader.test.tsx
```

Note the test IDs: `round-header`, `import-file-input`, `import-btn`, `new-round-btn`, `export-btn` (lives in ExportMenu).

- [ ] **Step 2: Replace RoundHeader.tsx**

```tsx
'use client';

import { useRef } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { readRoundFile } from '@/lib/persistence/io';
import { Button } from '@/components/ui/button';
import ExportMenu from './ExportMenu';

export default function RoundHeader() {
  const round = useRoundStore(s => s.round);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!round) return null;

  const { role, meta } = round;

  let participants: string;
  if (role === 'judge') {
    const aff = meta.affName?.trim() || 'Aff';
    const neg = meta.negName?.trim() || 'Neg';
    participants = `${aff} (Aff) vs ${neg} (Neg)`;
  } else {
    const opponent = meta.opponent?.trim() || 'Opponent';
    participants = `Aff vs ${opponent}`;
  }

  function handleNewRound() {
    useRoundStore.setState({ round: null, activeSheetId: null, selection: null, mode: 'normal' });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readRoundFile(file);
      useRoundStore.setState({ round: imported, activeSheetId: null, selection: null, mode: 'normal' });
    } catch {
      alert('Failed to import: file may be invalid or from an incompatible version.');
    }
    e.target.value = '';
  }

  return (
    <header
      className="flex items-center justify-between h-12 px-4 bg-card border-b border-border flex-none"
      data-testid="round-header"
    >
      <span className="text-sm font-semibold text-zinc-900">{participants}</span>
      <div className="no-print flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="Import round file"
          className="hidden"
          onChange={handleImportChange}
          data-testid="import-file-input"
        />
        <ExportMenu />
        <Button
          variant="outline"
          size="sm"
          onClick={handleImportClick}
          data-testid="import-btn"
        >
          Import
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewRound}
          data-testid="new-round-btn"
        >
          New round
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose src/components/RoundHeader.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/RoundHeader.tsx
git commit -m "feat(ui): migrate RoundHeader to Tailwind + shadcn Button"
```

---

### Task 7: Replace ExportMenu with shadcn DropdownMenu

**Files:**
- Modify: `src/components/ExportMenu.tsx`
- Modify: `src/components/ExportMenu.test.tsx`
- Modify: `vitest.setup.ts`

Radix DropdownMenu uses `PointerEvent` internally. jsdom lacks a full `PointerEvent` implementation, so we polyfill it in the test setup and update the test to use `userEvent`.

- [ ] **Step 1: Add PointerEvent polyfill to vitest.setup.ts**

Add at the end of `vitest.setup.ts`:

```ts
// Radix UI components (DropdownMenu, Dialog) dispatch PointerEvents.
// jsdom doesn't implement PointerEvent; alias it to MouseEvent so Radix
// event handlers fire correctly under test.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).PointerEvent = window.MouseEvent;
}
```

- [ ] **Step 2: Replace ExportMenu.tsx**

```tsx
'use client';

import type { Round } from '@/lib/model/types';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { downloadRoundFile } from '@/lib/persistence/io';
import { downloadXlsx } from '@/lib/export/xlsx';
import { downloadPdf } from '@/lib/export/pdf';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ExportMenu() {
  async function run(fn: (round: Round) => unknown | Promise<unknown>) {
    const round = useRoundStore.getState().round;
    if (!round) return;
    try {
      await fn(round);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="export-btn">
          Export ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          data-testid="export-json"
          onSelect={() => run(r => downloadRoundFile(r))}
        >
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="export-excel"
          onSelect={() => run(r => downloadXlsx(r))}
        >
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="export-pdf"
          onSelect={() => run(r => downloadPdf(r))}
        >
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Update ExportMenu.test.tsx to use userEvent**

Radix DropdownMenu opens on pointer-down, not click. `userEvent.click` correctly simulates the full pointer event sequence; `fireEvent.click` does not. Update the test:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportMenu from './ExportMenu';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey } from '@/lib/format/presets';

vi.mock('@/lib/persistence/io', () => ({ downloadRoundFile: vi.fn() }));
vi.mock('@/lib/export/xlsx', () => ({ downloadXlsx: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/export/pdf', () => ({ downloadPdf: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  useRoundStore.getState().createRound({ role: 'aff', format: makeFormatByKey('policy'), meta: {} });
});

describe('ExportMenu', () => {
  it('opens on click and exposes the three formats', async () => {
    const user = userEvent.setup();
    render(<ExportMenu />);
    await user.click(screen.getByTestId('export-btn'));
    expect(screen.getByTestId('export-json')).toBeInTheDocument();
    expect(screen.getByTestId('export-excel')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
  });

  it('JSON item invokes downloadRoundFile', async () => {
    const user = userEvent.setup();
    const { downloadRoundFile } = await import('@/lib/persistence/io');
    render(<ExportMenu />);
    await user.click(screen.getByTestId('export-btn'));
    await user.click(screen.getByTestId('export-json'));
    expect(downloadRoundFile).toHaveBeenCalled();
  });

  it('Excel item invokes downloadXlsx', async () => {
    const user = userEvent.setup();
    const { downloadXlsx } = await import('@/lib/export/xlsx');
    render(<ExportMenu />);
    await user.click(screen.getByTestId('export-btn'));
    await user.click(screen.getByTestId('export-excel'));
    expect(downloadXlsx).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run ExportMenu tests**

```bash
npm test -- --reporter=verbose src/components/ExportMenu.test.tsx
```

Expected: all 3 pass. If the dropdown items aren't found after clicking the trigger, check that the PointerEvent polyfill is in `vitest.setup.ts` and that Radix portals are rendering into `document.body` (they do by default).

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ExportMenu.tsx src/components/ExportMenu.test.tsx vitest.setup.ts
git commit -m "feat(ui): replace ExportMenu with shadcn DropdownMenu; update tests for Radix"
```

---

### Task 8: Migrate Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
npm test -- --reporter=verbose src/components/Sidebar.test.tsx
```

Note: the test IDs used are `sidebar`, `sheet-{id}`, `drop-badge-{id}`, `rename-input-{id}`, `add-aff`, `add-neg`.

- [ ] **Step 2: Replace Sidebar.tsx**

```tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { useRoundStore, selectSheetsByGroup, selectSheetDropCount } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Sheet } from '@/lib/model/types';

interface GroupConfig {
  group: 'aff' | 'neg';
  label: string;
}

const GROUPS: GroupConfig[] = [
  { group: 'aff', label: 'Aff' },
  { group: 'neg', label: 'Neg' },
];

export default function Sidebar() {
  const round            = useRoundStore(s => s.round);
  const activeSheetId    = useRoundStore(s => s.activeSheetId);
  const setActiveSheet   = useRoundStore(s => s.setActiveSheet);
  const renamingSheetId  = useRoundStore(s => s.renamingSheetId);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);

  if (!round) return null;

  return (
    <nav
      className="no-print flex flex-col w-[220px] shrink-0 h-full bg-card border-r border-border"
      aria-label="Sheets"
      data-testid="sidebar"
    >
      <div className="flex-1 overflow-y-auto p-2">
        {GROUPS.map(({ group, label }) => {
          const sheets = selectSheetsByGroup(round, group);
          return (
            <div key={group} className="mb-3">
              <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400 px-2 pb-1">
                {label}
              </div>
              {sheets.length === 0 ? (
                <div className="text-zinc-400 text-xs px-2 py-1">No sheets</div>
              ) : (
                sheets.map(sheet => (
                  <SheetRow
                    key={sheet.id}
                    sheet={sheet}
                    dropCount={selectSheetDropCount(round, sheet.id)}
                    active={sheet.id === activeSheetId}
                    onSelect={() => setActiveSheet(sheet.id)}
                    isRenaming={sheet.id === renamingSheetId}
                    onStartRename={() => setRenamingSheet(sheet.id)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 p-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => executeCommand('sheet.newAff')}
          data-testid="add-aff"
        >
          + Aff
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => executeCommand('sheet.newNeg')}
          data-testid="add-neg"
        >
          + Neg
        </Button>
      </div>
    </nav>
  );
}

interface SheetRowProps {
  sheet: Sheet;
  dropCount: number;
  active: boolean;
  onSelect: () => void;
  isRenaming: boolean;
  onStartRename: () => void;
}

function SheetRow({ sheet, dropCount, active, onSelect, isRenaming, onStartRename }: SheetRowProps) {
  const renameSheet      = useRoundStore(s => s.renameSheet);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(sheet.title);

  useEffect(() => {
    if (isRenaming) {
      setValue(sheet.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, sheet.title]);

  function commit() {
    renameSheet(sheet.id, value.trim() || sheet.title);
    setRenamingSheet(null);
  }

  function cancel() {
    setRenamingSheet(null);
  }

  if (isRenaming) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md border',
        active ? 'bg-zinc-100 border-zinc-200 font-semibold' : 'border-transparent',
      )}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.stopPropagation(); commit(); }
            if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
          }}
          onBlur={commit}
          className="flex-1 text-[13px] text-zinc-900 bg-transparent border-none outline outline-1 outline-aff rounded-sm px-0.5 font-[inherit]"
          data-testid={`rename-input-${sheet.id}`}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      aria-current={active ? 'true' : undefined}
      data-testid={`sheet-${sheet.id}`}
      className={cn(
        'flex items-center justify-between gap-1.5 w-full text-left text-[13px] text-zinc-700 px-2 py-1.5 rounded-md border transition-colors',
        active
          ? 'bg-zinc-100 border-zinc-200 font-semibold text-zinc-900'
          : 'border-transparent hover:bg-zinc-50',
      )}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{sheet.title}</span>
      {dropCount > 0 && (
        <span className="badge-drop" data-testid={`drop-badge-${sheet.id}`}>
          {dropCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose src/components/Sidebar.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(ui): migrate Sidebar to Tailwind + shadcn Button"
```

---

### Task 9: Migrate SettingsPanel (Tailwind-only)

**Files:**
- Modify: `src/components/SettingsPanel.tsx`

SettingsPanel keeps its custom modal structure (no shadcn Dialog). This preserves the `onPanelKeyDown` pattern that the test suite exercises by dispatching native keyboard events directly on the panel element.

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
npm test -- --reporter=verbose src/components/SettingsPanel.test.tsx
```

Note all test IDs: `settings-overlay`, `settings-panel`, `settings-close`, `preset-{name}`, `cmd-{id}`, `chord-{id}`, `record-{id}`, `reset-{id}`.

- [ ] **Step 2: Replace SettingsPanel.tsx**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { COMMANDS, type CommandId } from '@/lib/commands/registry';
import { effectiveKeymap } from '@/lib/keymap/effective';
import { eventToChord } from '@/lib/keymap/resolve';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRESETS: { name: 'default' | 'vim'; label: string }[] = [
  { name: 'default', label: 'Default' },
  { name: 'vim', label: 'Vim' },
];

const COMMAND_LIST = Object.values(COMMANDS);

function chordForCommand(bindings: Record<string, CommandId>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [chord, cmd] of Object.entries(bindings)) {
    if (out[cmd] === undefined) out[cmd] = chord;
  }
  return out;
}

export default function SettingsPanel() {
  const open               = useRoundStore(s => s.settingsOpen);
  const keymapName         = useRoundStore(s => s.keymapName);
  const keymapOverrides    = useRoundStore(s => s.keymapOverrides);
  const setKeymapName      = useRoundStore(s => s.setKeymapName);
  const setKeymapOverride  = useRoundStore(s => s.setKeymapOverride);
  const clearKeymapOverride = useRoundStore(s => s.clearKeymapOverride);
  const setSettingsOpen    = useRoundStore(s => s.setSettingsOpen);

  const [recording, setRecording] = useState<CommandId | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setRecording(null); }, [open]);
  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

  const chordByCommand = useMemo(() => {
    const keymap = effectiveKeymap(keymapName, keymapOverrides);
    return chordForCommand(keymap.bindings.normal);
  }, [keymapName, keymapOverrides]);

  if (!open) return null;

  function close() { setSettingsOpen(false); }

  function selectPreset(name: 'default' | 'vim') {
    for (const commandId of Object.keys(keymapOverrides)) {
      clearKeymapOverride(commandId as CommandId);
    }
    setKeymapName(name);
    setRecording(null);
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (recording) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRecording(null); return; }
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const chord = eventToChord({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey });
      setKeymapOverride(recording, chord);
      setRecording(null);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[8vh] bg-black/30 z-[200]"
      onClick={close}
      data-testid="settings-overlay"
    >
      <div
        ref={panelRef}
        className="w-full max-w-[520px] max-h-[84vh] flex flex-col overflow-hidden bg-card border border-border rounded-[var(--radius)] shadow-lg outline-none"
        onClick={e => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard settings"
        data-testid="settings-panel"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-border shrink-0">
          <span className="text-[13px] font-semibold tracking-wide text-zinc-900">Keyboard</span>
          <button
            type="button"
            onClick={close}
            className="text-[13px] text-zinc-400 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded hover:text-zinc-600"
            aria-label="Close settings"
            data-testid="settings-close"
          >
            ✕
          </button>
        </div>

        {/* Preset switcher */}
        <div className="flex gap-1.5 px-3.5 py-2.5 border-b border-border shrink-0" role="group" aria-label="Keymap preset">
          {PRESETS.map(p => {
            const active = p.name === keymapName;
            return (
              <Button
                key={p.name}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                onClick={() => selectPreset(p.name)}
                aria-pressed={active}
                data-testid={`preset-${p.name}`}
              >
                {p.label}
              </Button>
            );
          })}
        </div>

        {/* Command list */}
        <ul className="list-none m-0 p-1.5 overflow-y-auto">
          {COMMAND_LIST.map(cmd => {
            const chord = chordByCommand[cmd.id];
            const overridden = keymapOverrides[cmd.id] !== undefined;
            const isRecording = recording === cmd.id;
            return (
              <li
                key={cmd.id}
                className="grid items-center gap-2.5 px-2 py-1.5 rounded-md"
                style={{ gridTemplateColumns: '1fr auto auto auto' }}
                data-testid={`cmd-${cmd.id}`}
              >
                <span className="text-[13px] text-zinc-900 overflow-hidden text-ellipsis whitespace-nowrap">
                  {cmd.label}
                </span>
                <span
                  className={cn(
                    'font-mono text-[12px] bg-zinc-50 border rounded-md px-1.5 py-0.5 min-w-[64px] text-center whitespace-nowrap',
                    overridden ? 'text-sel border-sel' : 'text-zinc-400 border-zinc-200',
                  )}
                  data-testid={`chord-${cmd.id}`}
                >
                  {isRecording ? 'Press a key…' : chord ?? '—'}
                </span>
                <Button
                  type="button"
                  variant={isRecording ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRecording(isRecording ? null : cmd.id)}
                  data-testid={`record-${cmd.id}`}
                >
                  {isRecording ? 'Cancel' : 'Record'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearKeymapOverride(cmd.id)}
                  disabled={!overridden}
                  data-testid={`reset-${cmd.id}`}
                  aria-label={`Reset ${cmd.label} binding`}
                >
                  Reset
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose src/components/SettingsPanel.test.tsx
```

Expected: all pass. The panel structure and all `data-testid` attributes are identical; only the styling changed.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx
git commit -m "feat(ui): migrate SettingsPanel to Tailwind (keep custom modal structure)"
```

---

### Task 10: Migrate KeybindingsCheatsheet → shadcn Dialog

**Files:**
- Modify: `src/components/KeybindingsCheatsheet.tsx`

The cheatsheet has simple close behavior: Escape (handled by Radix) or `?` key (added via `onKeyDown`). No chord recording, so Dialog wrapping is safe.

- [ ] **Step 1: Replace KeybindingsCheatsheet.tsx**

```tsx
'use client';

import { useRoundStore } from '@/lib/store/useRoundStore';
import { COMMANDS, type CommandId } from '@/lib/commands/registry';
import { effectiveKeymap } from '@/lib/keymap/useKeymap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const GROUPS = [
  { label: 'Navigate', rows: [{ commandId: 'move.up' as CommandId }, { commandId: 'move.down' as CommandId }, { commandId: 'move.left' as CommandId }, { commandId: 'move.right' as CommandId }] },
  { label: 'Edit', rows: [{ commandId: 'edit.enter' as CommandId }, { commandId: 'edit.exit' as CommandId, insertMode: true }, { commandId: 'node.addAnswer' as CommandId }, { commandId: 'node.answerAcross' as CommandId }, { commandId: 'arg.newRoot' as CommandId }, { commandId: 'node.delete' as CommandId }] },
  { label: 'Status', rows: [{ commandId: 'status.toggleConceded' as CommandId }, { commandId: 'status.toggleExtended' as CommandId }] },
  { label: 'Sheets', rows: [{ commandId: 'sheet.prev' as CommandId }, { commandId: 'sheet.next' as CommandId }, { commandId: 'sheet.quickSwitch' as CommandId }, { commandId: 'sheet.newAff' as CommandId }, { commandId: 'sheet.newNeg' as CommandId }, { commandId: 'sheet.rename' as CommandId }, { commandId: 'sheet.jump1' as CommandId }] },
  { label: 'Timers', rows: [{ commandId: 'timer.toggleSpeech' as CommandId }, { commandId: 'timer.togglePrepAff' as CommandId }, { commandId: 'timer.togglePrepNeg' as CommandId }] },
  { label: 'App', rows: [{ commandId: 'settings.open' as CommandId }, { commandId: 'help.open' as CommandId }] },
] as const;

const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '↩', Delete: 'Del', Backspace: '⌫', Tab: '⇥',
};

function prettyChord(chord: string): string {
  return chord.split('+').map(part => {
    if (part === 'Meta') return '⌘';
    if (part === 'Ctrl') return '⌃';
    if (part === 'Alt') return '⌥';
    if (part === 'Shift') return '⇧';
    return KEY_LABELS[part] ?? part;
  }).join('');
}

export default function KeybindingsCheatsheet() {
  const open = useRoundStore(s => s.cheatsheetOpen);
  const setCheatsheetOpen = useRoundStore(s => s.setCheatsheetOpen);

  function close() { setCheatsheetOpen(false); }

  const keymap = effectiveKeymap();
  const normalBindings = keymap.bindings.normal;
  const insertBindings = keymap.bindings.insert;

  const chordFor: Partial<Record<CommandId, string>> = {};
  for (const [chord, cmd] of Object.entries(normalBindings)) {
    if (!chordFor[cmd as CommandId]) chordFor[cmd as CommandId] = chord;
  }
  for (const [chord, cmd] of Object.entries(insertBindings)) {
    if (!chordFor[cmd as CommandId]) chordFor[cmd as CommandId] = chord;
  }

  return (
    <Dialog open={open} onOpenChange={val => { if (!val) close(); }}>
      <DialogContent
        className="max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden p-0"
        data-testid="cheatsheet-panel"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === '?') { e.preventDefault(); e.stopPropagation(); close(); }
        }}
      >
        <DialogHeader className="px-[18px] pt-[14px] pb-2.5 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold text-zinc-900">Keyboard shortcuts</DialogTitle>
        </DialogHeader>

        <div
          className="overflow-y-auto px-[18px] py-3 grid gap-4"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          {GROUPS.map(group => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-1">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.rows.map(({ commandId, insertMode }) => {
                  const chord = chordFor[commandId];
                  const isJumpAnchor = commandId === 'sheet.jump1';
                  if (!chord && !isJumpAnchor) return null;
                  const displayChord = isJumpAnchor
                    ? prettyChord(chord ?? 'Meta+1').replace('1', '1–9')
                    : prettyChord(chord!);
                  const label = isJumpAnchor ? 'Jump to sheet 1–9' : COMMANDS[commandId].label;

                  return (
                    <div key={commandId} className="flex items-center gap-2">
                      <kbd className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-px bg-zinc-50 border border-zinc-200 border-b-2 rounded font-mono text-[12px] text-zinc-900 shrink-0 whitespace-nowrap">
                        {displayChord}
                      </kbd>
                      <span className="text-[12px] text-zinc-700 flex items-center gap-1">
                        {label}
                        {insertMode && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-50 border border-zinc-200 rounded px-1 leading-4">
                            insert
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify cheatsheet opens and closes**

```bash
npm run dev
```

Press the keybinding that opens the cheatsheet (default: `?` in normal mode). Verify it opens, shows shortcuts, closes on Escape, closes on `?` again.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all pass. (There is no `KeybindingsCheatsheet.test.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/KeybindingsCheatsheet.tsx
git commit -m "feat(ui): migrate KeybindingsCheatsheet to shadcn Dialog + Tailwind"
```

---

### Task 11: Migrate QuickSwitcher (Tailwind-only)

**Files:**
- Modify: `src/components/QuickSwitcher.tsx`

The QuickSwitcher is a bespoke command palette with a top search input; no shadcn component maps to it cleanly. Convert inline styles to Tailwind only.

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
npm test -- --reporter=verbose src/components/QuickSwitcher.test.tsx
```

Note: test IDs are `quick-switcher-overlay`, `quick-switcher`, `quick-switcher-input`, `qs-sheet-{id}`.

- [ ] **Step 2: Replace QuickSwitcher.tsx**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';

export default function QuickSwitcher() {
  const open           = useRoundStore(s => s.quickSwitcherOpen);
  const round          = useRoundStore(s => s.round);
  const setActiveSheet = useRoundStore(s => s.setActiveSheet);
  const setOpen        = useRoundStore(s => s.setQuickSwitcherOpen);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const all = round?.sheets ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter(s => s.title.toLowerCase().includes(q)) : all;
  }, [round?.sheets, query]);

  if (!open) return null;

  function select(sheetId: string) {
    setActiveSheet(sheetId);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const first = filtered[0];
      if (first) select(first.id);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[12vh] bg-black/30 z-[100]"
      onClick={() => setOpen(false)}
      data-testid="quick-switcher-overlay"
    >
      <div
        className="w-full max-w-[420px] overflow-hidden bg-card border border-border rounded-[var(--radius)] shadow-lg"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        data-testid="quick-switcher"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Jump to sheet…"
          className="w-full text-[14px] text-zinc-900 bg-card border-none border-b border-border px-3.5 py-3 focus:outline-none box-border"
          data-testid="quick-switcher-input"
          aria-label="Filter sheets"
        />
        <ul className="list-none m-0 p-1.5 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="text-zinc-400 text-[13px] px-2.5 py-2">No matching sheets</li>
          ) : (
            filtered.map(sheet => (
              <li key={sheet.id}>
                <button
                  type="button"
                  className="block w-full text-left text-[13px] text-zinc-900 bg-transparent border-none rounded-md px-2.5 py-2 cursor-pointer hover:bg-zinc-50"
                  onClick={() => select(sheet.id)}
                  data-testid={`qs-sheet-${sheet.id}`}
                >
                  {sheet.title}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose src/components/QuickSwitcher.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/QuickSwitcher.tsx
git commit -m "feat(ui): migrate QuickSwitcher to Tailwind"
```

---

### Task 12: Clean up Workspace + AppRoot layout shells

**Files:**
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/AppRoot.tsx` (no visual change — already clean)

- [ ] **Step 1: Replace Workspace.tsx**

```tsx
'use client';

import { useEffect } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { useKeymap } from '@/lib/keymap/useKeymap';
import RoundHeader from './RoundHeader';
import Sidebar from './Sidebar';
import QuickSwitcher from './QuickSwitcher';
import SettingsPanel from './SettingsPanel';
import KeybindingsCheatsheet from './KeybindingsCheatsheet';
import FlowGrid from './FlowGrid';
import PrintView from './PrintView';

export default function Workspace() {
  useKeymap();

  const activeSheetId = useRoundStore(s => s.activeSheetId);

  useEffect(() => {
    const { round, selection, mode } = useRoundStore.getState();
    if (!activeSheetId || !round || mode === 'insert') return;
    if (selection?.sheetId === activeSheetId && selection.nodeId !== '') return;

    const sheetNodes = round.nodes
      .filter(n => n.sheetId === activeSheetId)
      .sort((a, b) => {
        const colA = round.format.speeches.findIndex(s => s.id === a.speechId);
        const colB = round.format.speeches.findIndex(s => s.id === b.speechId);
        return colA !== colB ? colA - colB : a.order - b.order;
      });

    if (sheetNodes.length > 0) {
      const first = sheetNodes[0];
      useRoundStore.getState().setSelection({ sheetId: first.sheetId, speechId: first.speechId, nodeId: first.id });
    } else {
      useRoundStore.getState().setSelection(null);
    }
  }, [activeSheetId]);

  return (
    <div className="flex flex-col h-screen bg-zinc-50" data-testid="workspace">
      <RoundHeader />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto p-4" data-testid="workspace-content">
          {activeSheetId ? (
            <FlowGrid sheetId={activeSheetId} />
          ) : (
            <div className="text-zinc-400 text-[13px] p-6">No sheet selected</div>
          )}
        </main>
      </div>
      <QuickSwitcher />
      <SettingsPanel />
      <KeybindingsCheatsheet />
      <PrintView />
    </div>
  );
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat(ui): migrate Workspace layout to Tailwind"
```

---

### Task 13: Final verification

- [ ] **Step 1: Full test run**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no errors. If ESLint flags unused `styles` objects in any file, they've been replaced by Tailwind and can be deleted.

- [ ] **Step 4: Smoke test in dev**

```bash
npm run dev
```

Verify in the browser:
- Setup screen: DM Sans font, shadcn Card, Input fields, toggle buttons, Submit button
- Header: Export ▾ dropdown opens with keyboard nav; Import and New round buttons
- Sidebar: Aff/Neg group labels in DM Mono; sheet rows highlight on active; + Aff / + Neg buttons
- Flow grid: column headers in DM Mono; Aff cells have blue left border; Neg cells red; selected cell has violet outline; drop badge is amber — all unchanged
- Settings panel opens (via keybinding or command); chord recording works; Escape closes
- Keybindings cheatsheet opens (via `?`); shows grid layout; Escape closes
- Quick switcher opens; fuzzy filter works; Enter selects first result

- [ ] **Step 5: Verify print output**

In the browser, open the flow grid and trigger Print (Ctrl+P / Cmd+P). Confirm the `.no-print` elements (header, sidebar, overlays) are hidden and the flow grid spans full width.
