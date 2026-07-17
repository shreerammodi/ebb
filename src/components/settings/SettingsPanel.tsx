"use client";

import {
    ArrowsClockwise,
    type Icon,
    Keyboard,
    Palette,
    PencilSimpleLine,
    X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { FONTS, DEFAULT_FONT_ID, type FontId } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { eventToChord } from "@/lib/keymap/resolve";
import { restoreMenuAccelerators, suspendMenuAccelerators } from "@/lib/keymap/useDesktopMenu";
import { useSettingsShortcut } from "@/lib/keymap/useSettingsShortcut";
import type { Side } from "@/lib/model/types";
import { isMacPlatform } from "@/lib/platform";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { DEFAULT_SIDE_COLORS } from "@/lib/theme/applySideColors";
import type { ThemeMode } from "@/lib/theme/mode";
import { isDesktop } from "@/lib/update/adapter";
import { cn } from "@/lib/utils";

import SettingRow from "./SettingRow";
import UpdateSettings from "./UpdateSettings";

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
];

const SIDE_OPTIONS: { id: Side; label: string }[] = [
    { id: "aff", label: "Aff" },
    { id: "neg", label: "Neg" },
];

const COMMAND_LIST = Object.values(COMMANDS);

/**
 * Chords the native menu permanently owns and never exposes to the keymap:
 * Select All and Cut/Copy/Paste keep their own OS accelerators regardless of
 * any rebind, and mod+Q quits the app. Recording one of these is a silent
 * no-op rather than a saved override that would never fire.
 */
function isReservedChord(chord: string): boolean {
    const mod = isMacPlatform() ? "Meta" : "Ctrl";
    return [`${mod}+a`, `${mod}+c`, `${mod}+v`, `${mod}+x`, `${mod}+q`].includes(chord);
}

type Category = "display" | "editor" | "keyboard" | "updates";

const BASE_CATEGORIES: { id: Category; label: string; icon: Icon }[] = [
    { id: "display", label: "Display", icon: Palette },
    { id: "editor", label: "Editor", icon: PencilSimpleLine },
    { id: "keyboard", label: "Keyboard", icon: Keyboard },
];

// The Updates category is desktop-only; the web build never has an updater.
const CATEGORIES: { id: Category; label: string; icon: Icon }[] = isDesktop()
    ? [...BASE_CATEGORIES, { id: "updates", label: "Updates", icon: ArrowsClockwise }]
    : BASE_CATEGORIES;

function chordForCommand(bindings: Record<string, CommandId>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [chord, cmd] of Object.entries(bindings)) {
        if (out[cmd] === undefined) out[cmd] = chord;
    }
    return out;
}

export default function SettingsPanel() {
    // The panel owns the chord that opens it, so it works on every screen.
    useSettingsShortcut();

    const open = useFlowStore((s) => s.settingsOpen);
    const keymapOverrides = useFlowStore((s) => s.keymapOverrides);
    const setKeymapOverride = useFlowStore((s) => s.setKeymapOverride);
    const clearKeymapOverride = useFlowStore((s) => s.clearKeymapOverride);
    const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);
    const flowFont = useFlowStore((s) => s.flowFont);
    const setFlowFont = useFlowStore((s) => s.setFlowFont);
    const theme = useFlowStore((s) => s.theme);
    const setTheme = useFlowStore((s) => s.setTheme);
    const affColor = useFlowStore((s) => s.affColor);
    const negColor = useFlowStore((s) => s.negColor);
    const setSideColor = useFlowStore((s) => s.setSideColor);
    const rfdVim = useFlowStore((s) => s.rfdVim);
    const setRfdVim = useFlowStore((s) => s.setRfdVim);
    const insertPaste = useFlowStore((s) => s.insertPaste);
    const setInsertPaste = useFlowStore((s) => s.setInsertPaste);
    const scrollZoom = useFlowStore((s) => s.scrollZoom);
    const setScrollZoom = useFlowStore((s) => s.setScrollZoom);
    const tooltips = useFlowStore((s) => s.tooltips);
    const setTooltips = useFlowStore((s) => s.setTooltips);
    const defaultGridZoom = useFlowStore((s) => s.defaultGridZoom);
    const setDefaultGridZoom = useFlowStore((s) => s.setDefaultGridZoom);

    const [recording, setRecording] = useState<CommandId | null>(null);
    const [category, setCategory] = useState<Category>("display");
    const [query, setQuery] = useState("");
    const [zoomDraft, setZoomDraft] = useState("");

    // Mirror the stored default zoom into the editable field on open and on
    // external changes (e.g. the field commits a clamped value back).
    useEffect(() => {
        setZoomDraft(String(Math.round(defaultGridZoom * 100)));
    }, [defaultGridZoom, open]);

    function commitZoom() {
        const n = parseInt(zoomDraft, 10);
        if (!Number.isNaN(n)) setDefaultGridZoom(n / 100);
        else setZoomDraft(String(Math.round(defaultGridZoom * 100)));
    }

    // Reset transient UI state whenever the dialog closes.
    useEffect(() => {
        if (!open) {
            setRecording(null);
            setQuery("");
            setCategory("display");
        }
    }, [open]);

    // Real menu accelerators would otherwise consume the chord being recorded
    // (and run its command) before the recorder's keydown handler sees it.
    // Suspended for the duration of recording, however it ends: chord
    // accepted, cancelled, or the panel unmounting mid-recording.
    useEffect(() => {
        if (!recording) return;
        suspendMenuAccelerators();
        return () => restoreMenuAccelerators();
    }, [recording]);

    const chordByCommand = useMemo(() => {
        const keymap = effectiveKeymap(keymapOverrides);
        return chordForCommand(keymap.bindings);
    }, [keymapOverrides]);

    const visibleCommands = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return COMMAND_LIST;
        return COMMAND_LIST.filter((c) => c.label.toLowerCase().includes(q));
    }, [query]);

    function close() {
        setSettingsOpen(false);
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
            if (isReservedChord(chord)) return;
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
                className="max-w-[840px] gap-0 overflow-hidden p-0 sm:max-w-[840px]"
            >
                <DialogTitle className="sr-only">Settings</DialogTitle>

                {/* Header */}
                <div className="border-border flex items-center justify-between border-b px-4 py-3">
                    <span className="text-foreground text-[15px] font-semibold">Settings</span>
                    <Tip label="Close" hoverOnly>
                        <DialogClose
                            data-testid="settings-close"
                            aria-label="Close settings"
                            className="text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-2"
                        >
                            <X className="size-4" />
                        </DialogClose>
                    </Tip>
                </div>

                {/* Two-pane body */}
                <div className="flex h-[70vh]">
                    {/* Left nav */}
                    <nav
                        className="border-border bg-muted/30 flex w-[180px] shrink-0 flex-col gap-0.5 border-r p-3"
                        aria-label="Settings categories"
                    >
                        <span className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                            Options
                        </span>
                        {CATEGORIES.map((c) => {
                            const active = c.id === category;
                            const Icon = c.icon;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    data-testid={`settings-nav-${c.id}`}
                                    onClick={() => setCategory(c.id)}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                                        active
                                            ? "bg-accent font-medium text-accent-foreground"
                                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                    )}
                                >
                                    <Icon className="size-4 shrink-0 opacity-80" />
                                    {c.label}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Right content */}
                    <div className="flex-1 overflow-y-auto px-5 py-2">
                        {category === "updates" && <UpdateSettings />}
                        {category === "display" && (
                            <div className="flex flex-col">
                                <SettingRow
                                    title="Theme"
                                    control={
                                        <div
                                            role="radiogroup"
                                            aria-label="Theme"
                                            className="flex items-center gap-1"
                                        >
                                            {THEME_OPTIONS.map((t) => {
                                                const checked = t.id === theme;
                                                return (
                                                    <label
                                                        key={t.id}
                                                        className={cn(
                                                            "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors",
                                                            checked
                                                                ? "bg-accent text-foreground"
                                                                : "text-muted-foreground hover:bg-accent/50",
                                                        )}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="theme"
                                                            value={t.id}
                                                            checked={checked}
                                                            onChange={() => setTheme(t.id)}
                                                            data-testid={`theme-${t.id}`}
                                                            className="accent-sel"
                                                        />
                                                        {t.label}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    }
                                />
                                <SettingRow
                                    title="Default zoom"
                                    description="Zoom level the flow grid opens at."
                                    control={
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={zoomDraft}
                                                onChange={(e) => setZoomDraft(e.target.value)}
                                                onBlur={commitZoom}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") e.currentTarget.blur();
                                                }}
                                                aria-label="Default zoom percentage"
                                                data-testid="default-zoom-input"
                                                className="h-8 w-16 text-right tabular-nums"
                                            />
                                            <span className="text-muted-foreground text-[13px]">
                                                %
                                            </span>
                                        </div>
                                    }
                                />
                                <SettingRow
                                    title="Scroll to zoom"
                                    description={`Zoom the flow grid by holding ${
                                        isMacPlatform() ? "Cmd" : "Ctrl"
                                    } and scrolling, or pinching on a trackpad. Turn off to leave the wheel alone.`}
                                    control={
                                        <Switch
                                            checked={scrollZoom}
                                            onCheckedChange={setScrollZoom}
                                            data-testid="scroll-zoom-toggle"
                                            aria-label="Scroll to zoom"
                                        />
                                    }
                                />
                                <SettingRow
                                    title="Tooltips"
                                    description="Hover hints on buttons and controls. Turn off to hide them."
                                    control={
                                        <Switch
                                            checked={tooltips}
                                            onCheckedChange={setTooltips}
                                            data-testid="tooltips-toggle"
                                            aria-label="Tooltips"
                                        />
                                    }
                                />
                                <SettingRow
                                    title="Flow font"
                                    description="Used for the sheet editor."
                                    control={
                                        <>
                                            <Select
                                                value={flowFont}
                                                onValueChange={(value) =>
                                                    setFlowFont(value as FontId)
                                                }
                                            >
                                                <SelectTrigger
                                                    aria-label="Flow font"
                                                    data-testid="flow-font-select"
                                                    className="w-44"
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {FONTS.map((f) => (
                                                        <SelectItem
                                                            key={f.id}
                                                            value={f.id}
                                                            data-testid={`flow-font-${f.id}`}
                                                            style={{ fontFamily: f.cssVar }}
                                                        >
                                                            {f.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setFlowFont(DEFAULT_FONT_ID)}
                                                disabled={flowFont === DEFAULT_FONT_ID}
                                                data-testid="flow-font-reset"
                                                aria-label="Reset flow font to default"
                                            >
                                                Default
                                            </Button>
                                        </>
                                    }
                                >
                                    <p
                                        className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-900"
                                        style={{
                                            fontFamily:
                                                FONTS.find((f) => f.id === flowFont)?.cssVar ??
                                                FONTS[0].cssVar,
                                        }}
                                        data-testid="flow-font-sample"
                                    >
                                        Separation of powers outweighs
                                    </p>
                                </SettingRow>
                                <SettingRow
                                    title="Side colors"
                                    control={
                                        <>
                                            {SIDE_OPTIONS.map((s) => {
                                                const value =
                                                    (s.id === "aff" ? affColor : negColor) ??
                                                    DEFAULT_SIDE_COLORS[s.id];
                                                return (
                                                    <label
                                                        key={s.id}
                                                        className="text-muted-foreground flex items-center gap-1.5 text-[13px]"
                                                    >
                                                        <input
                                                            type="color"
                                                            value={value}
                                                            onChange={(e) =>
                                                                setSideColor(s.id, e.target.value)
                                                            }
                                                            data-testid={`side-color-${s.id}`}
                                                            aria-label={`${s.label} color`}
                                                            className="border-border h-5 w-8 cursor-pointer rounded border bg-transparent p-0"
                                                        />
                                                        {s.label}
                                                    </label>
                                                );
                                            })}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setSideColor("aff", null);
                                                    setSideColor("neg", null);
                                                }}
                                                disabled={affColor === null && negColor === null}
                                                data-testid="side-colors-reset"
                                                aria-label="Reset side colors to default"
                                            >
                                                Default
                                            </Button>
                                        </>
                                    }
                                />
                                <SettingRow
                                    title="Vim keybindings"
                                    description="Applies only to the RFD editor."
                                    control={
                                        <Switch
                                            checked={rfdVim}
                                            onCheckedChange={setRfdVim}
                                            data-testid="rfd-vim-toggle"
                                            aria-label="Vim keybindings"
                                        />
                                    }
                                />
                            </div>
                        )}
                        {category === "editor" && (
                            <div className="flex flex-col">
                                <SettingRow
                                    title="Insert paste"
                                    description="With insert paste on, pasted cells push the text already in those columns down instead of writing over it."
                                    control={
                                        <Switch
                                            checked={insertPaste}
                                            onCheckedChange={setInsertPaste}
                                            data-testid="insert-paste-toggle"
                                            aria-label="Insert paste"
                                        />
                                    }
                                />
                            </div>
                        )}
                        {category === "keyboard" && (
                            <div className="flex flex-col gap-3">
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
                                                style={{
                                                    gridTemplateColumns: "1fr auto auto auto",
                                                }}
                                                data-testid={`cmd-${cmd.id}`}
                                            >
                                                <span className="text-foreground overflow-hidden text-[13px] text-ellipsis whitespace-nowrap">
                                                    {cmd.label}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "bg-muted min-w-[64px] rounded-md border px-1.5 py-0.5 text-center font-mono text-[12px] whitespace-nowrap",
                                                        overridden
                                                            ? "border-sel text-sel"
                                                            : "border-border text-muted-foreground",
                                                    )}
                                                    data-testid={`chord-${cmd.id}`}
                                                >
                                                    {isRecording ? "Press a key…" : (chord ?? "—")}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant={isRecording ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() =>
                                                        setRecording(isRecording ? null : cmd.id)
                                                    }
                                                    data-testid={`record-${cmd.id}`}
                                                >
                                                    {isRecording ? "Cancel" : "Record"}
                                                </Button>
                                                <Tip label={`Reset ${cmd.label} binding`}>
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
                                                </Tip>
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
