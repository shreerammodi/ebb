"use client";

import {
    ArrowsClockwise,
    DownloadSimple,
    type Icon,
    Keyboard,
    Palette,
    PencilSimpleLine,
    UsersThree,
    X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
import type { CardMirrorTextType } from "@/lib/bridge/cardmirror";
import { copyText, selectNode } from "@/lib/clipboard";
import { addContact, type Contacts, isEndpointId, removeContact } from "@/lib/collab/contacts";
import { machineName, myEndpointId } from "@/lib/collab/machineName";
import {
    CARDMIRROR_COMMANDS,
    COLLAB_COMMANDS,
    COMMANDS,
    type CommandId,
} from "@/lib/commands/registry";
import { errorMessage } from "@/lib/errorMessage";
import { FONTS, DEFAULT_FONT_ID, type FontId } from "@/lib/fonts/registry";
import { DEFAULT_ARG_MARKER, formatArgMarker } from "@/lib/grid/argNumber";
import { buildChordMap } from "@/lib/keymap/displayChord";
import { eventToChord } from "@/lib/keymap/resolve";
import { restoreMenuAccelerators, suspendMenuAccelerators } from "@/lib/keymap/useDesktopMenu";
import { useSettingsShortcut } from "@/lib/keymap/useSettingsShortcut";
import type { Side } from "@/lib/model/types";
import { getFlowFs } from "@/lib/persistence/flowFs";
import { displayPath } from "@/lib/persistence/flowPaths";
import { isMacPlatform } from "@/lib/platform";
import { useCollabStore } from "@/lib/store/useCollabStore";
import { type SidebarPosition, useFlowStore } from "@/lib/store/useFlowStore";
import { DEFAULT_SIDE_COLORS } from "@/lib/theme/applySideColors";
import type { ThemeMode } from "@/lib/theme/mode";
import { getCurrentVersion, getSystemInfo, isDesktop } from "@/lib/update/adapter";
import type { UpdateUiState } from "@/lib/update/useAutoUpdate";
import { cn } from "@/lib/utils";

import { useUpdate } from "../update/UpdateProvider";
import SettingRow from "./SettingRow";

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
];

const SIDEBAR_POSITION_OPTIONS: { id: SidebarPosition; label: string }[] = [
    { id: "left", label: "Left" },
    { id: "top", label: "Top" },
    { id: "bottom", label: "Bottom" },
];

/** CardMirror's insert types, in the words its own document editor uses:
 *  its outline heading levels, deepest first, then plain body text. */
const CARDMIRROR_TEXT_TYPES: { value: CardMirrorTextType; label: string }[] = [
    { value: "analytic", label: "Analytic" },
    { value: "tag", label: "Tag" },
    { value: "block", label: "Block" },
    { value: "hat", label: "Hat" },
    { value: "pocket", label: "Pocket" },
    { value: "body", label: "Body" },
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

type Category = "display" | "editor" | "keyboard" | "collaboration" | "updates";

const BASE_CATEGORIES: { id: Category; label: string; icon: Icon }[] = [
    { id: "display", label: "Display", icon: Palette },
    { id: "editor", label: "Editor", icon: PencilSimpleLine },
    { id: "keyboard", label: "Keyboard", icon: Keyboard },
];

// Both trailing categories are desktop-only: the web build has no updater, and
// shared editing runs on an endpoint only the desktop app can bind.
const CATEGORIES: { id: Category; label: string; icon: Icon }[] = isDesktop()
    ? [
          ...BASE_CATEGORIES,
          { id: "collaboration", label: "Collaboration", icon: UsersThree },
          { id: "updates", label: "Updates", icon: ArrowsClockwise },
      ]
    : BASE_CATEGORIES;

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
    const sidebarPosition = useFlowStore((s) => s.sidebarPosition);
    const setSidebarPosition = useFlowStore((s) => s.setSidebarPosition);
    const affColor = useFlowStore((s) => s.affColor);
    const negColor = useFlowStore((s) => s.negColor);
    const setSideColor = useFlowStore((s) => s.setSideColor);
    const rfdVim = useFlowStore((s) => s.rfdVim);
    const setRfdVim = useFlowStore((s) => s.setRfdVim);
    const insertPaste = useFlowStore((s) => s.insertPaste);
    const setInsertPaste = useFlowStore((s) => s.setInsertPaste);
    const appendEdit = useFlowStore((s) => s.appendEdit);
    const setAppendEdit = useFlowStore((s) => s.setAppendEdit);
    const cxEnterAlternates = useFlowStore((s) => s.cxEnterAlternates);
    const setCxEnterAlternates = useFlowStore((s) => s.setCxEnterAlternates);
    const cardmirrorTextType = useFlowStore((s) => s.cardmirrorTextType);
    const setCardmirrorTextType = useFlowStore((s) => s.setCardmirrorTextType);
    const cardmirrorEnabled = useFlowStore((s) => s.cardmirrorEnabled);
    const setCardmirrorEnabled = useFlowStore((s) => s.setCardmirrorEnabled);
    const cardmirrorSpaceArguments = useFlowStore((s) => s.cardmirrorSpaceArguments);
    const setCardmirrorSpaceArguments = useFlowStore((s) => s.setCardmirrorSpaceArguments);
    const cardmirrorPushEdits = useFlowStore((s) => s.cardmirrorPushEdits);
    const setCardmirrorPushEdits = useFlowStore((s) => s.setCardmirrorPushEdits);
    const collabEnabled = useFlowStore((s) => s.collabEnabled);
    const setCollabEnabled = useFlowStore((s) => s.setCollabEnabled);
    const collabRelayEnabled = useFlowStore((s) => s.collabRelayEnabled);
    const setCollabRelayEnabled = useFlowStore((s) => s.setCollabRelayEnabled);
    const collabListenEnabled = useFlowStore((s) => s.collabListenEnabled);
    const setCollabListenEnabled = useFlowStore((s) => s.setCollabListenEnabled);
    const collabShowViewers = useFlowStore((s) => s.collabShowViewers);
    const setCollabShowViewers = useFlowStore((s) => s.setCollabShowViewers);
    const scrollZoom = useFlowStore((s) => s.scrollZoom);
    const setScrollZoom = useFlowStore((s) => s.setScrollZoom);
    const alignSpeeches = useFlowStore((s) => s.alignSpeeches);
    const setAlignSpeeches = useFlowStore((s) => s.setAlignSpeeches);
    const tooltips = useFlowStore((s) => s.tooltips);
    const setTooltips = useFlowStore((s) => s.setTooltips);
    const boldCells = useFlowStore((s) => s.boldCells);
    const setBoldCells = useFlowStore((s) => s.setBoldCells);
    const defaultGridZoom = useFlowStore((s) => s.defaultGridZoom);
    const setDefaultGridZoom = useFlowStore((s) => s.setDefaultGridZoom);
    const speakingWpm = useFlowStore((s) => s.speakingWpm);
    const setSpeakingWpm = useFlowStore((s) => s.setSpeakingWpm);

    const [recording, setRecording] = useState<CommandId | null>(null);
    const [category, setCategory] = useState<Category>("display");
    const [query, setQuery] = useState("");
    const [zoomDraft, setZoomDraft] = useState("");
    const [wpmDraft, setWpmDraft] = useState("");

    // Mirror stored numeric settings into their drafts on open and external changes.
    useEffect(() => {
        setZoomDraft(String(Math.round(defaultGridZoom * 100)));
        setWpmDraft(String(speakingWpm));
    }, [defaultGridZoom, speakingWpm, open]);

    function commitZoom() {
        const n = parseInt(zoomDraft, 10);
        if (!Number.isNaN(n)) setDefaultGridZoom(n / 100);
        else setZoomDraft(String(Math.round(defaultGridZoom * 100)));
    }

    function commitWpm() {
        const n = parseInt(wpmDraft, 10);
        if (!Number.isNaN(n)) setSpeakingWpm(n);
        else setWpmDraft(String(speakingWpm));
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

    // Inverting a keymap of a few dozen entries, so it is rebuilt rather than
    // memoized on a key the compiler cannot see it read.
    const chordByCommand = buildChordMap();

    // isDesktop() gates the bridge itself; the setting gates the user's choice.
    const cardmirrorOn = cardmirrorEnabled && isDesktop();

    // Rebinding a command a switched-off feature owns is pointless. The
    // collaboration commands are palette-only by design, so they never appear
    // here at all.
    const visibleCommands = useMemo(() => {
        const list = COMMAND_LIST.filter(
            (c) =>
                !COLLAB_COMMANDS.includes(c.id) &&
                (cardmirrorOn || !CARDMIRROR_COMMANDS.includes(c.id)),
        );
        const q = query.trim().toLowerCase();
        if (!q) return list;
        return list.filter((c) => c.label.toLowerCase().includes(q));
    }, [query, cardmirrorOn]);

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
                                    title="Sidebar"
                                    control={
                                        <div
                                            role="radiogroup"
                                            aria-label="Sidebar position"
                                            className="flex items-center gap-1"
                                        >
                                            {SIDEBAR_POSITION_OPTIONS.map((option) => {
                                                const checked = option.id === sidebarPosition;
                                                return (
                                                    <label
                                                        key={option.id}
                                                        className={cn(
                                                            "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors",
                                                            checked
                                                                ? "bg-accent text-foreground"
                                                                : "text-muted-foreground hover:bg-accent/50",
                                                        )}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="sidebar-position"
                                                            value={option.id}
                                                            checked={checked}
                                                            onChange={() =>
                                                                setSidebarPosition(option.id)
                                                            }
                                                            data-testid={`sidebar-position-${option.id}`}
                                                            className="accent-sel"
                                                        />
                                                        {option.label}
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
                                    title="Speaking speed"
                                    description="Used to estimate the selected speech's length."
                                    control={
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={wpmDraft}
                                                onChange={(e) => setWpmDraft(e.target.value)}
                                                onBlur={commitWpm}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") e.currentTarget.blur();
                                                }}
                                                aria-label="Speaking speed in words per minute"
                                                data-testid="speaking-wpm-input"
                                                className="h-8 w-16 text-right tabular-nums"
                                            />
                                            <span className="text-muted-foreground text-[13px]">
                                                WPM
                                            </span>
                                        </div>
                                    }
                                />
                                <SettingRow
                                    title="Scroll to zoom"
                                    description={`Enables zooming the flow grid by holding ${
                                        isMacPlatform() ? "Cmd" : "Ctrl"
                                    } and scrolling, or pinching on a trackpad.`}
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
                                    title="Visually align speeches"
                                    description="Adds padding so that each sheet lines up visually and columns don't shift around."
                                    control={
                                        <Switch
                                            checked={alignSpeeches}
                                            onCheckedChange={setAlignSpeeches}
                                            data-testid="align-speeches-toggle"
                                            aria-label="Visually align speeches"
                                        />
                                    }
                                />
                                <SettingRow
                                    title="Tooltips"
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
                                    title="Bold cells"
                                    description="Visually bolds all cells."
                                    control={
                                        <Switch
                                            checked={boldCells}
                                            onCheckedChange={setBoldCells}
                                            data-testid="bold-cells-toggle"
                                            aria-label="Bold cells"
                                        />
                                    }
                                />
                                <SettingRow
                                    title="Flow font"
                                    control={
                                        <>
                                            <Select
                                                value={flowFont}
                                                // Base UI Select renders the raw value unless given a
                                                // value->label map to resolve the trigger display.
                                                items={FONTS.map((f) => ({
                                                    value: f.id,
                                                    label: f.label,
                                                }))}
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
                            </div>
                        )}
                        {category === "editor" && (
                            <div className="flex flex-col">
                                <SettingRow
                                    title="Insert paste"
                                    description="With insert paste on, pasted cells push the cells already in those columns down instead of writing over them."
                                    control={
                                        <Switch
                                            checked={insertPaste}
                                            onCheckedChange={setInsertPaste}
                                            data-testid="insert-paste-toggle"
                                            aria-label="Insert paste"
                                        />
                                    }
                                />
                                <SettingRow
                                    title="Append mode"
                                    description="With append mode on, typing on a cell that already has text adds to the end of it instead of deleting existing content."
                                    control={
                                        <Switch
                                            checked={appendEdit}
                                            onCheckedChange={setAppendEdit}
                                            data-testid="append-edit-toggle"
                                            aria-label="Append mode"
                                        />
                                    }
                                />
                                <SettingRow
                                    title="Cross-ex Enter"
                                    description="Enter on the cross-ex sheet moves from a question to its answer, and from an answer to the next question a row down."
                                    control={
                                        <Switch
                                            checked={cxEnterAlternates}
                                            onCheckedChange={setCxEnterAlternates}
                                            data-testid="cx-enter-toggle"
                                            aria-label="Cross-ex Enter"
                                        />
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
                                <SettingRow
                                    title="Flows folder"
                                    description="Where new flows are saved; does not affect existing flows."
                                    control={<FlowsFolderControl />}
                                />
                                <ArgMarkerSection />
                                {isDesktop() && (
                                    <section
                                        className="mt-4 flex flex-col"
                                        data-testid="cardmirror-section"
                                    >
                                        {/* The label rides the divider, so the
                                            preceding row's hairline is the only
                                            rule between the two groups. */}
                                        <div className="mb-1 flex items-center gap-2">
                                            <h3 className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
                                                CardMirror
                                            </h3>
                                            <span className="bg-border/60 h-px flex-1" />
                                        </div>
                                        <SettingRow
                                            title="Enable CardMirror integration"
                                            control={
                                                <Switch
                                                    checked={cardmirrorEnabled}
                                                    onCheckedChange={setCardmirrorEnabled}
                                                    data-testid="cardmirror-enabled-toggle"
                                                    aria-label="Enable CardMirror integration"
                                                />
                                            }
                                        />
                                        {cardmirrorEnabled && (
                                            <>
                                                <SettingRow
                                                    title="Space pasted arguments"
                                                    description="Leave a blank row between cards and analytics pasted in one send."
                                                    control={
                                                        <Switch
                                                            checked={cardmirrorSpaceArguments}
                                                            onCheckedChange={
                                                                setCardmirrorSpaceArguments
                                                            }
                                                            data-testid="cardmirror-space-arguments-toggle"
                                                            aria-label="Space pasted arguments"
                                                        />
                                                    }
                                                />
                                                <SettingRow
                                                    title="Send to CardMirror as"
                                                    description="What style ebb should apply to text sent to CardMirror."
                                                    control={
                                                        <Select
                                                            value={cardmirrorTextType}
                                                            items={CARDMIRROR_TEXT_TYPES}
                                                            onValueChange={(value) =>
                                                                setCardmirrorTextType(
                                                                    value as CardMirrorTextType,
                                                                )
                                                            }
                                                        >
                                                            <SelectTrigger
                                                                aria-label="Send to CardMirror as"
                                                                data-testid="cardmirror-text-type-select"
                                                                className="w-44"
                                                            >
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {CARDMIRROR_TEXT_TYPES.map((t) => (
                                                                    <SelectItem
                                                                        key={t.value}
                                                                        value={t.value}
                                                                        data-testid={`cardmirror-text-type-${t.value}`}
                                                                    >
                                                                        {t.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    }
                                                />
                                                <SettingRow
                                                    title="Push edits to CardMirror"
                                                    description="Editing a cell that came from CardMirror rewrites that text in the document."
                                                    control={
                                                        <Switch
                                                            checked={cardmirrorPushEdits}
                                                            onCheckedChange={setCardmirrorPushEdits}
                                                            data-testid="cardmirror-push-edits-toggle"
                                                            aria-label="Push edits to CardMirror"
                                                        />
                                                    }
                                                />
                                            </>
                                        )}
                                    </section>
                                )}
                            </div>
                        )}
                        {category === "collaboration" && (
                            <div className="flex flex-col" data-testid="collab-section">
                                <SettingRow
                                    title="Shared editing"
                                    description="Enables collaboration features, off by default."
                                    control={
                                        <Switch
                                            checked={collabEnabled}
                                            onCheckedChange={setCollabEnabled}
                                            data-testid="collab-enabled-toggle"
                                            aria-label="Shared editing"
                                        />
                                    }
                                />
                                {collabEnabled && (
                                    <>
                                        <SettingRow
                                            title="Allow relay"
                                            description="Off restricts a session to direct connections. On enables connections across networks."
                                            control={
                                                <Switch
                                                    checked={collabRelayEnabled}
                                                    onCheckedChange={setCollabRelayEnabled}
                                                    data-testid="collab-relay-toggle"
                                                    aria-label="Allow relay"
                                                />
                                            }
                                        />
                                        <SettingRow
                                            title="Listen for invites"
                                            control={
                                                <Switch
                                                    checked={collabListenEnabled}
                                                    onCheckedChange={setCollabListenEnabled}
                                                    data-testid="collab-listen-toggle"
                                                    aria-label="Listen for invites"
                                                />
                                            }
                                        />
                                        <SettingRow
                                            title="Show viewer cursors"
                                            control={
                                                <Switch
                                                    checked={collabShowViewers}
                                                    onCheckedChange={setCollabShowViewers}
                                                    data-testid="collab-show-viewers-toggle"
                                                    aria-label="Show viewer cursors"
                                                />
                                            }
                                        />
                                        <DisplayNameRow />
                                        <MyEndpointId />
                                        <ContactList />
                                    </>
                                )}
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

// --- Setting rows ---------------------------------------------------------------

/**
 * Picks the folder new flows are filed in.
 *
 * The resolved path is always shown, default or not, because "where do my
 * rounds go" should never require guessing. Reset clears the override rather
 * than writing the current default in, so a flow folder that follows the
 * platform keeps following it.
 */
export function FlowsFolderControl() {
    const flowsDir = useFlowStore((s) => s.flowsDir);
    const setFlowsDir = useFlowStore((s) => s.setFlowsDir);
    const [resolved, setResolved] = useState("");
    const [home, setHome] = useState("");

    useEffect(() => {
        let mounted = true;
        void getFlowFs()
            .then((fs) => fs.locations())
            .then(({ flowsDir: fallback, home: h }) => {
                if (!mounted) return;
                setResolved(fallback);
                setHome(h);
            });
        return () => {
            mounted = false;
        };
    }, []);

    async function choose() {
        try {
            const fs = await getFlowFs();
            const dir = await fs.pickDirectory();
            if (dir) setFlowsDir(dir);
        } catch (err) {
            toast.error(errorMessage(err, "Could not choose that folder"));
        }
    }

    const shown = flowsDir ?? resolved;

    return (
        <div className="flex min-w-0 items-center justify-end gap-2">
            <code
                data-testid="flows-folder-path"
                title={shown}
                className="text-muted-foreground max-w-[16rem] truncate font-mono text-xs"
            >
                {shown ? displayPath(shown, home) : "..."}
            </code>
            <Button
                variant="outline"
                size="sm"
                onClick={() => void choose()}
                data-testid="flows-folder-choose"
            >
                Change
            </Button>
            {flowsDir && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFlowsDir(null)}
                    data-testid="flows-folder-reset"
                >
                    Reset
                </Button>
            )}
        </div>
    );
}

/**
 * What Insert argument number writes. The marker is written exactly as typed,
 * so the preview sets each one against sample text: a trailing space or
 * separator is invisible in the field and only shows where the argument
 * starts. It uses a 2AC column because Settings has no round to ask.
 */
export function ArgMarkerSection() {
    const argMarker = useFlowStore((s) => s.argMarker);
    const setArgMarker = useFlowStore((s) => s.setArgMarker);

    return (
        <section className="mt-4 flex flex-col" data-testid="arg-marker-section">
            <div className="mb-1 flex items-center gap-2">
                <h3 className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
                    Argument numbers
                </h3>
                <span className="bg-border/60 h-px flex-1" />
            </div>
            <SettingRow
                title="Marker text"
                description="The format for argument markers; %Speech% denotes where the speech name goes and %Number% denotes where the count goes. Without %Number%, the count goes on the end. Leave empty for the default."
                control={
                    <Input
                        value={argMarker}
                        onChange={(e) => setArgMarker(e.target.value)}
                        placeholder={DEFAULT_ARG_MARKER}
                        aria-label="Argument marker text"
                        data-testid="arg-marker"
                        className="h-8 w-52"
                    />
                }
            >
                <div
                    className="text-muted-foreground flex flex-col text-[12px] whitespace-pre"
                    data-testid="arg-marker-preview"
                >
                    {[1, 2].map((n) => (
                        <span key={n}>
                            <span className="text-foreground">
                                {formatArgMarker(argMarker, "2AC", n)}
                            </span>
                            argument
                        </span>
                    ))}
                </div>
            </SettingRow>
        </section>
    );
}

/** Rust's `std::env::consts` names, spelled the way people say them. */
const OS_LABELS: Record<string, string> = {
    macos: "macOS",
    windows: "Windows",
    linux: "Linux",
};
const ARCH_LABELS: Record<string, string> = {
    aarch64: "arm64",
    x86_64: "x86-64",
};

/** Why the install button is disabled, shown as its hover tooltip. */
function idleTooltip(state: UpdateUiState): string {
    switch (state.status) {
        case "checking":
            return "Checking for updates…";
        case "downloading":
            return "Downloading the update…";
        case "error":
            return "Couldn't check for updates.";
        default:
            return "Already on the latest version.";
    }
}

/**
 * Desktop-only update controls. The single "Install latest update" button is
 * the whole story: greyed with an "already latest" tooltip until a newer
 * version has been downloaded, then green and clickable to install + relaunch.
 * A newer version arrives either from the background poller (auto-check) or the
 * explicit "Check for updates" button. Only rendered inside the Tauri shell
 * (the settings panel gates the category on `isDesktop()`).
 */
export function UpdateSettings() {
    const config = useFlowStore((s) => s.updateConfig);
    const setUpdateConfig = useFlowStore((s) => s.setUpdateConfig);
    const { state, checkNow, installAndRestart } = useUpdate();
    const [install, setInstall] = useState<{ version: string; platform: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([getCurrentVersion(), getSystemInfo()]).then(([version, system]) => {
            if (cancelled) return;
            const [os, arch] = system ?? [];
            setInstall({
                version,
                platform: os
                    ? `${OS_LABELS[os] ?? os} (${arch ? (ARCH_LABELS[arch] ?? arch) : "unknown"})`
                    : "Unknown",
            });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const busy = state.status === "checking" || state.status === "downloading";
    const ready = state.status === "ready";

    // Native `disabled` swallows pointer events, so the tooltip never opens.
    // Keep the button interactive, mark it aria-disabled, and no-op the click.
    const installButton = (
        <Button
            type="button"
            size="sm"
            variant={ready ? "default" : "secondary"}
            aria-disabled={!ready}
            onClick={ready ? () => void installAndRestart() : undefined}
            data-testid="install-update"
            className={cn(
                ready
                    ? "bg-green-600 text-white hover:bg-green-600/90 dark:bg-green-600 dark:hover:bg-green-600/80"
                    : "cursor-not-allowed opacity-60",
            )}
        >
            <DownloadSimple />
            Install latest update
        </Button>
    );

    return (
        <div className="flex flex-col">
            <SettingRow
                title="Check for updates automatically"
                description="Downloads happen silently; installing always waits for your confirmation."
                control={
                    <Switch
                        checked={config.autoCheckEnabled}
                        onCheckedChange={(v) => setUpdateConfig({ autoCheckEnabled: v })}
                        data-testid="toggle-autoCheck"
                        aria-label="Check for updates automatically"
                    />
                }
            />

            <SettingRow
                title="Software updates"
                control={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void checkNow()}
                            disabled={busy}
                            data-testid="check-updates"
                        >
                            {state.status === "downloading"
                                ? "Downloading…"
                                : busy
                                  ? "Checking…"
                                  : "Check for updates"}
                        </Button>
                        {ready ? (
                            installButton
                        ) : (
                            <Tip label={idleTooltip(state)}>{installButton}</Tip>
                        )}
                    </>
                }
            />

            {install && (
                <div data-testid="install-info" className="flex flex-col">
                    <SettingRow
                        title="Version"
                        control={
                            <span className="text-foreground text-[13px] tabular-nums">
                                {install.version}
                            </span>
                        }
                    />
                    <SettingRow
                        title="Platform"
                        control={
                            <span className="text-foreground text-[13px]">{install.platform}</span>
                        }
                    />
                </div>
            )}
        </div>
    );
}

/**
 * The name a shared round carries. Left empty, the machine's own name is
 * broadcast, which is why the field shows it as a placeholder rather than
 * filling it in: a hostname written here would be saved to the config file and
 * follow this laptop's name onto every machine that file syncs to.
 */
export function DisplayNameRow() {
    const collabName = useFlowStore((s) => s.collabName);
    const setCollabName = useFlowStore((s) => s.setCollabName);
    const [host, setHost] = useState("");

    useEffect(() => {
        let live = true;
        void machineName().then((name) => {
            if (live) setHost(name);
        });
        return () => {
            live = false;
        };
    }, []);

    return (
        <SettingRow
            title="Your name"
            description="What a partner sees when you share a round with them. They can rename you on their side."
            control={
                <Input
                    value={collabName}
                    onChange={(e) => setCollabName(e.target.value)}
                    placeholder={host || "This machine"}
                    aria-label="Your name"
                    data-testid="collab-name"
                    className="h-8 w-52"
                />
            }
        />
    );
}

/**
 * This machine's own EndpointId, so a partner can save it before either of you
 * has a round to share. It is the public half of the identity file, read off
 * the disk rather than off a bound endpoint, so showing it puts nothing on the
 * network.
 */
export function MyEndpointId() {
    const endpointId = useCollabStore((s) => s.endpointId);
    const text = useRef<HTMLParagraphElement>(null);

    useEffect(() => {
        void myEndpointId().then((id) => {
            if (id) useCollabStore.getState().setEndpointId(id);
        });
    }, []);

    async function copy() {
        if (!endpointId) return;
        if (await copyText(endpointId)) {
            toast.success("Your ID is copied.");
            return;
        }
        selectNode(text.current);
        toast.error("Could not reach the clipboard. Press Cmd+C to copy your ID.");
    }

    return (
        <SettingRow
            title="Your ID"
            description="Send this to a partner and they can add you as a contact to easily share flows. Flows still need to be shared manually."
            control={
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!endpointId}
                    onClick={copy}
                    data-testid="my-id-copy"
                >
                    Copy
                </Button>
            }
        >
            <p
                ref={text}
                data-testid="my-id"
                className="border-border bg-muted/40 text-muted-foreground rounded-md border p-2 font-mono text-[12px] break-all select-all"
            >
                {endpointId ?? "Reading your identity..."}
            </p>
        </SettingRow>
    );
}

/** An EndpointId is a long key; a row shows the first eight characters. */
const SHORT_ID = 8;

/**
 * The saved peers, edited in place, and the form that adds one.
 *
 * Two partners on the way to a tournament have no round to share yet, so a
 * contact is not only something a finished session leaves behind: each of them
 * sends the other the ID above and types it in here. The pair is then dialable
 * with no ticket for every round after.
 *
 * A row is a name and a key and nothing else. What a partner may do belongs to
 * the round they are invited to and is chosen at the invitation, so there is
 * nothing to grade here.
 */
export function ContactList() {
    const contacts = useFlowStore((s) => s.contacts);
    const setContacts = useFlowStore((s) => s.setContacts);

    // Insertion order, so a rename never moves the row out from under the
    // cursor typing it.
    const entries = Object.entries(contacts);

    return (
        <SettingRow title="Contacts">
            {entries.length === 0 ? (
                <p className="text-muted-foreground text-[12px]" data-testid="contact-list-empty">
                    No partners saved yet. Add one below, or save one after a shared flow session.
                </p>
            ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {entries.map(([endpointId, contact]) => {
                        const short = endpointId.slice(0, SHORT_ID);
                        const shown = contact.name.trim() === "" ? short : contact.name;
                        return (
                            <li
                                key={endpointId}
                                data-testid={`contact-row-${endpointId}`}
                                className="flex items-center gap-2"
                            >
                                <Input
                                    value={contact.name}
                                    onChange={(e) =>
                                        setContacts(
                                            addContact(contacts, endpointId, {
                                                ...contact,
                                                name: e.target.value,
                                            }),
                                        )
                                    }
                                    // A nameless entry is unreadable to the config
                                    // parser, so an emptied field falls back to the
                                    // short id rather than losing the peer.
                                    onBlur={() => {
                                        if (contact.name.trim() !== "") return;
                                        setContacts(
                                            addContact(contacts, endpointId, {
                                                ...contact,
                                                name: short,
                                            }),
                                        );
                                    }}
                                    aria-label={`Name for ${shown}`}
                                    data-testid={`contact-name-${endpointId}`}
                                    className="h-8 min-w-0 flex-1"
                                />
                                <span
                                    title={endpointId}
                                    className="text-muted-foreground shrink-0 font-mono text-[11px]"
                                >
                                    {short}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    aria-label={`Remove ${shown}`}
                                    data-testid={`contact-remove-${endpointId}`}
                                    onClick={() => setContacts(removeContact(contacts, endpointId))}
                                >
                                    Remove
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <AddContact contacts={contacts} onAdd={setContacts} />
        </SettingRow>
    );
}

/**
 * Adds a partner from the ID they sent. The shape is checked here so a typo is
 * caught at the form rather than at a dial that fails with nothing to point
 * at; whether the key is real is still the transport's answer.
 */
function AddContact({
    contacts,
    onAdd,
}: {
    contacts: Contacts;
    onAdd: (contacts: Contacts) => void;
}) {
    const [endpointId, setEndpointId] = useState("");
    const [name, setName] = useState("");
    const id = endpointId.trim();
    const known = id in contacts;
    const shaped = isEndpointId(id);
    const ready = shaped && !known && name.trim() !== "";

    function add() {
        if (!ready) return;
        onAdd(addContact(contacts, id, { name: name.trim() }));
        setEndpointId("");
        setName("");
    }

    return (
        <div className="mt-3 flex flex-col gap-1.5" data-testid="add-contact">
            <div className="flex items-center gap-2">
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") add();
                    }}
                    placeholder="Name"
                    aria-label="Partner name"
                    data-testid="add-contact-name"
                    className="h-8 w-32 shrink-0"
                />
                <Input
                    value={endpointId}
                    onChange={(e) => setEndpointId(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") add();
                    }}
                    placeholder="Their ID"
                    aria-label="Partner ID"
                    data-testid="add-contact-id"
                    className="h-8 min-w-0 flex-1 font-mono text-[12px]"
                />
                <Button
                    type="button"
                    size="xs"
                    disabled={!ready}
                    onClick={add}
                    data-testid="add-contact-save"
                >
                    Add
                </Button>
            </div>
            {id !== "" && !shaped && (
                <p className="text-destructive text-[11px]" data-testid="add-contact-error">
                    That is not an ID. Ask them for the one under Your ID in their settings.
                </p>
            )}
            {known && (
                <p className="text-muted-foreground text-[11px]" data-testid="add-contact-known">
                    {contacts[id]?.name} is already saved under that ID.
                </p>
            )}
        </div>
    );
}
