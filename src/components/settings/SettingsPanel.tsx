"use client";

import { X } from "lucide-react";
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
import { Tip } from "@/components/ui/tooltip";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { FONTS, DEFAULT_FONT_ID, type FontId } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { eventToChord } from "@/lib/keymap/resolve";
import type { Side } from "@/lib/model/types";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { DEFAULT_SIDE_COLORS } from "@/lib/theme/applySideColors";
import type { ThemeMode } from "@/lib/theme/mode";
import { isDesktop } from "@/lib/update/adapter";
import { cn } from "@/lib/utils";

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

type Category = "display" | "keyboard" | "updates";

const BASE_CATEGORIES: { id: Category; label: string }[] = [
    { id: "display", label: "Display" },
    { id: "keyboard", label: "Keyboard" },
];

// The Updates category is desktop-only; the web build never has an updater.
const CATEGORIES: { id: Category; label: string }[] = isDesktop()
    ? [...BASE_CATEGORIES, { id: "updates", label: "Updates" }]
    : BASE_CATEGORIES;

function chordForCommand(bindings: Record<string, CommandId>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [chord, cmd] of Object.entries(bindings)) {
        if (out[cmd] === undefined) out[cmd] = chord;
    }
    return out;
}

export default function SettingsPanel() {
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
                    <Tip label="Close">
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
                <div className="flex max-h-[70vh]">
                    {/* Left nav */}
                    <nav
                        className="border-border flex w-[130px] shrink-0 flex-col gap-1 border-r p-2"
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
                                            : "text-muted-foreground hover:bg-accent/50",
                                    )}
                                >
                                    {c.label}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Right content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {category === "updates" && <UpdateSettings />}
                        {category === "display" && (
                            <div className="flex flex-col gap-4">
                                <div
                                    role="radiogroup"
                                    aria-labelledby="theme-label"
                                    className="flex flex-col gap-1"
                                >
                                    <span
                                        id="theme-label"
                                        className="text-foreground text-[13px] font-medium"
                                    >
                                        Theme
                                    </span>
                                    {THEME_OPTIONS.map((t) => {
                                        const checked = t.id === theme;
                                        return (
                                            <label
                                                key={t.id}
                                                className={cn(
                                                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                                                    checked ? "bg-accent" : "hover:bg-accent/50",
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
                                                <span className="text-foreground text-[14px]">
                                                    {t.label}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span
                                            id="flow-font-label"
                                            className="text-foreground text-[13px] font-medium"
                                        >
                                            Flow font
                                        </span>
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
                                    </div>
                                    <p className="text-muted-foreground mb-1 text-[12px]">
                                        Font used for flowed argument text and the inline editor.
                                    </p>
                                    <Select
                                        value={flowFont}
                                        onValueChange={(value) => setFlowFont(value as FontId)}
                                    >
                                        <SelectTrigger
                                            aria-labelledby="flow-font-label"
                                            data-testid="flow-font-select"
                                            className="w-full"
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
                                    <p
                                        className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-900"
                                        style={{
                                            fontFamily:
                                                FONTS.find((f) => f.id === flowFont)?.cssVar ??
                                                FONTS[0].cssVar,
                                        }}
                                        data-testid="flow-font-sample"
                                    >
                                        Separation of powers outweighs
                                    </p>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-foreground text-[13px] font-medium">
                                            Argument colors
                                        </span>
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
                                            aria-label="Reset argument colors to default"
                                        >
                                            Default
                                        </Button>
                                    </div>
                                    <p className="text-muted-foreground mb-1 text-[12px]">
                                        Ink used for aff and neg columns, headers, and labels.
                                    </p>
                                    <div className="flex flex-col gap-1.5">
                                        {SIDE_OPTIONS.map((s) => {
                                            const value =
                                                (s.id === "aff" ? affColor : negColor) ??
                                                DEFAULT_SIDE_COLORS[s.id];
                                            return (
                                                <label
                                                    key={s.id}
                                                    className="flex w-fit items-center gap-2.5 rounded-md px-2 py-1.5"
                                                >
                                                    <input
                                                        type="color"
                                                        value={value}
                                                        onChange={(e) =>
                                                            setSideColor(s.id, e.target.value)
                                                        }
                                                        data-testid={`side-color-${s.id}`}
                                                        aria-label={`${s.label} color`}
                                                        className="border-border h-5 w-9 cursor-pointer rounded border bg-transparent p-0"
                                                    />
                                                    <span className="text-foreground text-[14px]">
                                                        {s.label}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
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
