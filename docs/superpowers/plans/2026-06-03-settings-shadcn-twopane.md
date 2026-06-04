# Settings dialog redesign (shadcn two-pane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the settings menu as a shadcn `Dialog` with a two-pane (sidebar-nav) layout — a
`Display` pane (shadcn `Switch` toggles) and a `Keyboard` pane (preset switcher + filterable
shortcut list) — preserving all existing keymap-recording behavior.

**Architecture:** `SettingsPanel` renders a controlled shadcn `Dialog` bound to the Zustand
`settingsOpen` flag. Inside `DialogContent` (which keeps the `settings-panel` testid and the
chord-recording `onKeyDown`), a left `nav` switches a local `category` state between `display` and
`keyboard`; the right pane renders only the active category. Toggles become shadcn `Switch`; the
long shortcut list gets a shadcn `Input` filter.

**Tech Stack:** Next.js 15 / React 19, shadcn (new-york, zinc) on the unified `radix-ui` package,
Zustand store, Vitest + Testing Library.

---

## File Structure

- **Create** `src/components/ui/switch.tsx` — vendored shadcn `Switch` primitive (radix Switch
  wrapper). One responsibility: an on/off control matching the existing ui kit's conventions.
- **Rewrite** `src/components/SettingsPanel.tsx` — the settings dialog. Same store wiring and
  recording logic; new Dialog shell + two-pane layout + filter.
- **Update** `src/components/SettingsPanel.test.tsx` — navigation-aware tests + new tests for pane
  switching and filtering.

Reused as-is: `src/components/ui/dialog.tsx`, `ui/button.tsx`, `ui/input.tsx`, `@/lib/utils` (`cn`),
the keymap modules, and the command registry. No store or registry changes.

---

### Task 1: Add the shadcn `Switch` ui component

**Files:**

- Create: `src/components/ui/switch.tsx`

- [ ] **Step 1: Create the Switch component**

This is the standard shadcn new-york `Switch`, authored against the installed unified `radix-ui`
package (same import style as `src/components/ui/dialog.tsx` / `label.tsx`). Verified present:
`require('radix-ui')` exports `Switch`.

```tsx
"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` Expected: no errors (the new file compiles; `SwitchPrimitive.Root`/`.Thumb`
resolve from `radix-ui`).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/switch.tsx
git commit -m "feat(ui): add shadcn Switch component"
```

---

### Task 2: Update the tests to be navigation-aware (red)

**Files:**

- Test: `src/components/SettingsPanel.test.tsx`

The shortcut rows now live in the **Keyboard** pane, so shortcut tests must navigate there first. We
also add tests for pane switching and the filter. These will FAIL against the current component (no
`settings-nav-keyboard`, and toggles are still raw checkboxes).

- [ ] **Step 1: Replace the test file**

Overwrite `src/components/SettingsPanel.test.tsx` with:

```tsx
/**
 * SettingsPanel component tests.
 *
 * Uses the real Zustand store. Resets keymap-related state before each test
 * and clears localStorage so persistence assertions are deterministic.
 *
 * The dialog is a two-pane layout: shortcut rows live in the "Keyboard" pane,
 * so shortcut tests click the Keyboard nav item before asserting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { COMMANDS } from "@/lib/commands/registry";
import SettingsPanel from "./SettingsPanel";

const KEY = "df-keymap-settings";

function resetStore() {
  useRoundStore.setState({
    keymapName: "vim",
    keymapOverrides: {},
    settingsOpen: true,
  });
}

function dispatchPanelKey(key: string, init: Partial<KeyboardEventInit> = {}) {
  const panel = screen.getByTestId("settings-panel");
  act(() => {
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** The shortcut list lives in the Keyboard pane; switch to it first. */
async function gotoKeyboard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-nav-keyboard"));
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStore();
  });

  it("renders nothing when settings are closed", () => {
    useRoundStore.setState({ settingsOpen: false });
    render(<SettingsPanel />);
    expect(screen.queryByTestId("settings-panel")).toBeNull();
  });

  it("lists commands with their current binding from the active keymap", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    // The vim preset binds move.down to "j".
    const row = screen.getByTestId("cmd-move.down");
    expect(within(row).getByText(COMMANDS["move.down"].label)).toBeTruthy();
    expect(screen.getByTestId("chord-move.down").textContent).toBe("j");
  });

  it("switching preset updates keymapName in the store", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.click(screen.getByTestId("preset-default"));

    expect(useRoundStore.getState().keymapName).toBe("default");
    // Default binds move.down to ArrowDown.
    expect(screen.getByTestId("chord-move.down").textContent).toBe("ArrowDown");
  });

  it("switching preset clears existing overrides", async () => {
    const user = userEvent.setup();
    useRoundStore.getState().setKeymapOverride("move.down", "Meta+j");
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.click(screen.getByTestId("preset-default"));

    expect(useRoundStore.getState().keymapOverrides).toEqual({});
  });

  it("records a chord override: click Record then press a key", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.click(screen.getByTestId("record-move.down"));
    // Now recording — the next keydown is captured as the new chord.
    dispatchPanelKey("g");

    expect(useRoundStore.getState().keymapOverrides["move.down"]).toBe("g");
    expect(screen.getByTestId("chord-move.down").textContent).toBe("g");
  });

  it("records a chord with modifiers", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.click(screen.getByTestId("record-move.up"));
    dispatchPanelKey("k", { metaKey: true });

    expect(useRoundStore.getState().keymapOverrides["move.up"]).toBe("Meta+k");
  });

  it("ignores lone modifier keys while recording", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.click(screen.getByTestId("record-move.down"));
    dispatchPanelKey("Shift", { shiftKey: true });

    // Still recording, no override saved yet.
    expect(useRoundStore.getState().keymapOverrides["move.down"]).toBeUndefined();
    expect(screen.getByTestId("record-move.down").textContent).toBe("Cancel");
  });

  it("Reset clears an override back to the preset binding", async () => {
    const user = userEvent.setup();
    useRoundStore.getState().setKeymapOverride("move.down", "g");
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    expect(screen.getByTestId("chord-move.down").textContent).toBe("g");
    await user.click(screen.getByTestId("reset-move.down"));

    expect(useRoundStore.getState().keymapOverrides["move.down"]).toBeUndefined();
    expect(screen.getByTestId("chord-move.down").textContent).toBe("j");
  });

  it("shows shortcuts only in the Keyboard pane", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    // Display is the default pane — no command rows.
    expect(screen.queryByTestId("cmd-move.down")).toBeNull();

    await user.click(screen.getByTestId("settings-nav-keyboard"));
    expect(screen.getByTestId("cmd-move.down")).toBeTruthy();

    await user.click(screen.getByTestId("settings-nav-display"));
    expect(screen.queryByTestId("cmd-move.down")).toBeNull();
  });

  it("filters the command list by label", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.type(screen.getByTestId("shortcut-filter"), "Undo");

    // "Undo" matches only the edit.undo command label.
    expect(screen.getByTestId("cmd-edit.undo")).toBeTruthy();
    expect(screen.queryByTestId("cmd-move.down")).toBeNull();
  });

  it("Escape closes the panel", () => {
    render(<SettingsPanel />);
    dispatchPanelKey("Escape");
    expect(useRoundStore.getState().settingsOpen).toBe(false);
  });

  it("close button closes the panel", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByTestId("settings-close"));
    expect(useRoundStore.getState().settingsOpen).toBe(false);
  });

  it("toggles autoNumber via the display switch", async () => {
    useRoundStore.getState().setSettingsOpen(true);
    render(<SettingsPanel />);
    const sw = screen.getByTestId("toggle-autoNumber");
    await userEvent.click(sw);
    expect(useRoundStore.getState().autoNumber).toBe(false);
    // Reset so other tests aren't affected
    useRoundStore.getState().setAutoNumber(true);
  });

  it("persists overrides to localStorage and effectiveKeymap uses them", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await gotoKeyboard(user);

    await user.click(screen.getByTestId("record-move.down"));
    dispatchPanelKey("g");

    // Persisted to localStorage.
    const raw = window.localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.keymapOverrides["move.down"]).toBe("g");
    expect(parsed.keymapName).toBe("vim");

    // effectiveKeymap reflects the override: "g" → move.down, old "j" removed.
    const keymap = effectiveKeymap(parsed.keymapName, parsed.keymapOverrides);
    expect(keymap.bindings.normal["g"]).toBe("move.down");
    expect(keymap.bindings.normal["j"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/components/SettingsPanel.test.tsx` Expected: FAIL — e.g.
`Unable to find an element by: [data-testid="settings-nav-keyboard"]` (and the new pane/filter tests
fail) because the current component has no nav, no filter, and renders all rows at once.

Do **not** commit yet — the implementation in Task 3 turns these green.

---

### Task 3: Rewrite `SettingsPanel` as a two-pane shadcn dialog (green)

**Files:**

- Rewrite: `src/components/SettingsPanel.tsx`
- Test: `src/components/SettingsPanel.test.tsx` (from Task 2)

- [ ] **Step 1: Replace the component**

Overwrite `src/components/SettingsPanel.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { eventToChord } from "@/lib/keymap/resolve";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PRESETS: { name: "default" | "vim"; label: string }[] = [
  { name: "default", label: "Default" },
  { name: "vim", label: "Vim" },
];

const COMMAND_LIST = Object.values(COMMANDS);

type Category = "display" | "keyboard";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "display", label: "Display" },
  { id: "keyboard", label: "Keyboard" },
];

function chordForCommand(bindings: Record<string, CommandId>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [chord, cmd] of Object.entries(bindings)) {
    if (out[cmd] === undefined) out[cmd] = chord;
  }
  return out;
}

export default function SettingsPanel() {
  const open = useRoundStore((s) => s.settingsOpen);
  const keymapName = useRoundStore((s) => s.keymapName);
  const keymapOverrides = useRoundStore((s) => s.keymapOverrides);
  const setKeymapName = useRoundStore((s) => s.setKeymapName);
  const setKeymapOverride = useRoundStore((s) => s.setKeymapOverride);
  const clearKeymapOverride = useRoundStore((s) => s.clearKeymapOverride);
  const setSettingsOpen = useRoundStore((s) => s.setSettingsOpen);
  const autoNumber = useRoundStore((s) => s.autoNumber);
  const labelDrops = useRoundStore((s) => s.labelDrops);
  const setAutoNumber = useRoundStore((s) => s.setAutoNumber);
  const setLabelDrops = useRoundStore((s) => s.setLabelDrops);

  const [recording, setRecording] = useState<CommandId | null>(null);
  const [category, setCategory] = useState<Category>("display");
  const [query, setQuery] = useState("");

  // Reset transient UI state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setRecording(null);
      setQuery("");
      setCategory("display");
    }
  }, [open]);

  const chordByCommand = useMemo(() => {
    const keymap = effectiveKeymap(keymapName, keymapOverrides);
    return chordForCommand(keymap.bindings.normal);
  }, [keymapName, keymapOverrides]);

  const visibleCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_LIST;
    return COMMAND_LIST.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  function close() {
    setSettingsOpen(false);
  }

  function selectPreset(name: "default" | "vim") {
    for (const commandId of Object.keys(keymapOverrides)) {
      clearKeymapOverride(commandId as CommandId);
    }
    setKeymapName(name);
    setRecording(null);
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (recording) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setRecording(null);
        return;
      }
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const chord = eventToChord({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
      setKeymapOverride(recording, chord);
      setRecording(null);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid="settings-panel"
        aria-label="Settings"
        onKeyDown={onPanelKeyDown}
        className="max-w-[560px] gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[15px] font-semibold text-zinc-900">Settings</span>
          <DialogClose
            data-testid="settings-close"
            aria-label="Close settings"
            className="rounded px-1.5 py-0.5 text-[13px] text-zinc-400 hover:text-zinc-600"
          >
            ✕
          </DialogClose>
        </div>

        {/* Two-pane body */}
        <div className="flex max-h-[70vh]">
          {/* Left nav */}
          <nav
            className="flex w-[130px] shrink-0 flex-col gap-1 border-r border-border p-2"
            aria-label="Settings categories"
          >
            {CATEGORIES.map((c) => {
              const active = c.id === category;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`settings-nav-${c.id}`}
                  onClick={() => setCategory(c.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-zinc-500 hover:bg-accent/50",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </nav>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-4">
            {category === "display" ? (
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between py-1.5 text-[13px] text-zinc-900">
                  Auto-number arguments
                  <Switch
                    checked={autoNumber}
                    onCheckedChange={setAutoNumber}
                    data-testid="toggle-autoNumber"
                    aria-label="Auto-number arguments"
                  />
                </label>
                <label className="flex items-center justify-between py-1.5 text-[13px] text-zinc-900">
                  Label drops
                  <Switch
                    checked={labelDrops}
                    onCheckedChange={setLabelDrops}
                    data-testid="toggle-labelDrops"
                    aria-label="Label drops"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Preset switcher */}
                <div className="flex gap-1.5" role="group" aria-label="Keymap preset">
                  {PRESETS.map((p) => {
                    const active = p.name === keymapName;
                    return (
                      <Button
                        key={p.name}
                        type="button"
                        variant={active ? "default" : "outline"}
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

                {/* Filter */}
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter shortcuts…"
                  data-testid="shortcut-filter"
                  aria-label="Filter shortcuts"
                  className="h-8"
                />

                {/* Command list */}
                <ul className="m-0 flex list-none flex-col p-0">
                  {visibleCommands.map((cmd) => {
                    const chord = chordByCommand[cmd.id];
                    const overridden = keymapOverrides[cmd.id] !== undefined;
                    const isRecording = recording === cmd.id;
                    return (
                      <li
                        key={cmd.id}
                        className="grid items-center gap-2.5 rounded-md px-2 py-1.5"
                        style={{ gridTemplateColumns: "1fr auto auto auto" }}
                        data-testid={`cmd-${cmd.id}`}
                      >
                        <span className="overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-zinc-900">
                          {cmd.label}
                        </span>
                        <span
                          className={cn(
                            "min-w-[64px] rounded-md border bg-zinc-50 px-1.5 py-0.5 text-center font-mono text-[12px] whitespace-nowrap",
                            overridden ? "border-sel text-sel" : "border-zinc-200 text-zinc-400",
                          )}
                          data-testid={`chord-${cmd.id}`}
                        >
                          {isRecording ? "Press a key…" : (chord ?? "—")}
                        </span>
                        <Button
                          type="button"
                          variant={isRecording ? "default" : "outline"}
                          size="sm"
                          onClick={() => setRecording(isRecording ? null : cmd.id)}
                          data-testid={`record-${cmd.id}`}
                        >
                          {isRecording ? "Cancel" : "Record"}
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
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run the SettingsPanel tests**

Run: `npx vitest run src/components/SettingsPanel.test.tsx` Expected: PASS (all tests, including the
new pane-switching and filter tests).

- [ ] **Step 3: Run the full test suite**

Run: `npm test` Expected: PASS — no regressions in other components.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel.tsx src/components/SettingsPanel.test.tsx
git commit -m "feat(settings): two-pane shadcn settings dialog with switch + shortcut filter"
```

---

## Manual verification (after Task 3)

Run the app (`npm run dev`) and open Settings (the `settings.open` command, default keymap binding)
to confirm:

- The dialog is centered with a left nav (`Display` / `Keyboard`).
- Display toggles are Switches and flip `autoNumber` / `labelDrops`.
- Keyboard pane: preset buttons, a working filter box, and Record/Reset behavior.
- Escape while recording cancels recording (dialog stays open); Escape otherwise closes.
- Clicking outside, the ✕ button, and the close affordance all dismiss the dialog.

---

## Self-Review notes

- **Spec coverage:** two-pane layout (Task 3 nav + panes), Switch toggles (Tasks 1, 3), shortcut
  filter (Task 3 `Input` + `visibleCommands`), Dialog shell + Escape-while-recording guard via
  `onPanelKeyDown` (Task 3), `settings-close` via `DialogClose` (Task 3), navigation-aware + new
  tests (Task 2). All spec sections map to tasks.
- **Placeholder scan:** none — all code is concrete.
- **Type consistency:** `Category`, `CATEGORIES`, `visibleCommands`, `onPanelKeyDown`, and testids
  (`settings-nav-display`, `settings-nav-keyboard`, `shortcut-filter`, `toggle-autoNumber`,
  `toggle-labelDrops`, `cmd-*`/`record-*`/`reset-*`/`chord-*`, `settings-panel`, `settings-close`)
  are used identically in the component and the tests.
