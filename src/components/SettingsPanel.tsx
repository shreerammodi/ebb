"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { FONTS, DEFAULT_FONT_ID } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { eventToChord } from "@/lib/keymap/resolve";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { isDesktop } from "@/lib/update/adapter";
import { cn } from "@/lib/utils";

import UpdateSettings from "./settings/UpdateSettings";

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
    const open = useRoundStore((s) => s.settingsOpen);
    const keymapOverrides = useRoundStore((s) => s.keymapOverrides);
    const setKeymapOverride = useRoundStore((s) => s.setKeymapOverride);
    const clearKeymapOverride = useRoundStore((s) => s.clearKeymapOverride);
    const setSettingsOpen = useRoundStore((s) => s.setSettingsOpen);
    const autoNumber = useRoundStore((s) => s.autoNumber);
    const labelDrops = useRoundStore((s) => s.labelDrops);
    const setAutoNumber = useRoundStore((s) => s.setAutoNumber);
    const setLabelDrops = useRoundStore((s) => s.setLabelDrops);
    const flowFont = useRoundStore((s) => s.flowFont);
    const setFlowFont = useRoundStore((s) => s.setFlowFont);

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
                            <X weight="bold" className="size-4" />
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
                                    aria-labelledby="flow-font-label"
                                    className="flex flex-col gap-1"
                                >
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
                                    {FONTS.map((f) => {
                                        const checked = f.id === flowFont;
                                        return (
                                            <label
                                                key={f.id}
                                                className={cn(
                                                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                                                    checked ? "bg-accent" : "hover:bg-accent/50",
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="flow-font"
                                                    value={f.id}
                                                    checked={checked}
                                                    onChange={() => setFlowFont(f.id)}
                                                    data-testid={`flow-font-${f.id}`}
                                                    className="accent-sel"
                                                />
                                                <span
                                                    className="text-foreground text-[14px]"
                                                    style={{
                                                        fontFamily: f.cssVar,
                                                    }}
                                                >
                                                    {f.label}
                                                </span>
                                            </label>
                                        );
                                    })}
                                    <p
                                        className="border-border text-foreground mt-1 rounded-md border bg-zinc-50 px-2.5 py-1.5 text-[13px]"
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
                                    <label className="text-foreground flex items-center justify-between py-1.5 text-[13px]">
                                        Auto-number arguments
                                        <Switch
                                            checked={autoNumber}
                                            onCheckedChange={setAutoNumber}
                                            data-testid="toggle-autoNumber"
                                            aria-label="Auto-number arguments"
                                        />
                                    </label>
                                    <label className="text-foreground flex items-center justify-between py-1.5 text-[13px]">
                                        Label drops
                                        <Switch
                                            checked={labelDrops}
                                            onCheckedChange={setLabelDrops}
                                            data-testid="toggle-labelDrops"
                                            aria-label="Label drops"
                                        />
                                    </label>
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
                                                        "min-w-[64px] rounded-md border bg-zinc-50 px-1.5 py-0.5 text-center font-mono text-[12px] whitespace-nowrap",
                                                        overridden
                                                            ? "border-sel text-sel"
                                                            : "border-zinc-200 text-muted-foreground",
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
