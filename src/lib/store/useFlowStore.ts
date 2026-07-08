/**
 * Zustand store for the active flow round and editor UI state.
 *
 * The grid's cell data lives in Handsontable at runtime; this store holds the
 * persisted FlowRound document plus app-level UI state. Every round-mutating
 * action replaces objects immutably and bumps updatedAt, which is what the
 * autosave subscription watches.
 */

import { create } from "zustand";

import type { CommandId } from "@/lib/commands/registry";
import { type FontId, DEFAULT_FONT_ID, resolveFontId } from "@/lib/fonts/registry";
import {
    firstFlowSheetId,
    makeFlowSheet,
    sortedSheets,
    type CellMeta,
    type FlowRound,
    type FlowSheet,
} from "@/lib/model/flow";
import type { Scouting, Side } from "@/lib/model/types";
import { resolveThemeMode, type ThemeMode } from "@/lib/theme/mode";
import { loadUpdateConfig, saveUpdateConfig } from "@/lib/update/settings";
import type { UpdateConfig } from "@/lib/update/types";

// --- State shape -------------------------------------------------------------

/** Payload for the delete-sheet Undo toast; the sheet carries its own data. */
export interface RemovedFlowSheet {
    sheet: FlowSheet;
    wasActive: boolean;
}

export interface FlowState {
    round: FlowRound | null;
    activeSheetId: string | null;
    /** Grid cell the reveal asked to jump to; carries the sheet so the matching pane selects it. */
    revealTarget: { sheetId: string; row: number; col: number } | null;
    /** Second pane's sheet id when split; null = single pane. */
    splitSheetId: string | null;
    /** Which pane is focused (1 = left, 2 = right); only meaningful when split. */
    focusedPane: 1 | 2;
    /** Speech (column) to switch to; HotGrid seeds every sheet's cursor to its top row and selects it on the active sheet. A fresh object re-fires the effect. */
    speechTarget: { speechId: string } | null;
    /** CommandId -> custom chord, overriding the preset binding. */
    keymapOverrides: Record<string, string>;
    flowFont: FontId;
    theme: ThemeMode;
    /** Custom aff/neg ink; null keeps the theme default. */
    affColor: string | null;
    negColor: string | null;
    /** Desktop auto-update behavior (opt-in, Tournament Mode). */
    updateConfig: UpdateConfig;
    /** The unified command/search palette. */
    quickSwitcherOpen: boolean;
    /** Initial query the palette opens with; ">" seeds command mode. */
    paletteSeed: string;
    settingsOpen: boolean;
    cheatsheetOpen: boolean;
    infoOpen: boolean;
    sidebarCollapsed: boolean;
    /** RFD drawer open/closed; persisted like sidebarCollapsed. */
    rfdOpen: boolean;
    /** Vim keybindings in the RFD editor; persisted like sidebarCollapsed. */
    rfdVim: boolean;
    renamingSheetId: string | null;
}

export interface FlowActions {
    loadRound(round: FlowRound, opts?: { activeSheetId?: string | null; newFlow?: boolean }): void;
    addSheet(input: { title?: string; group: "aff" | "neg" }): string;
    renameSheet(sheetId: string, title: string): void;
    removeSheet(sheetId: string): RemovedFlowSheet | null;
    restoreSheet(removed: RemovedFlowSheet): void;
    /** Renumbers the given flow sheets to contiguous order by array position. */
    reorderSheets(orderedFlowSheetIds: string[]): void;
    setActiveSheet(sheetId: string): void;
    /** Switch to a sheet and select one of its cells (used by the search palette). */
    revealCell(sheetId: string, row: number, col: number): void;
    /**
     * In single-pane mode, focuses the topmost flow sheet and seeds the
     * cursor at the given speech's top row. In split mode, records the
     * speech target for the focused pane without changing which sheets show.
     */
    switchSpeech(speechId: string): void;
    /** Opens a second pane on the next sheet, or collapses back to the focused pane's sheet. */
    toggleSplit(): void;
    /** Focuses the given pane; no-op outside split. */
    focusPane(pane: 1 | 2): void;
    /** Grid snapshot sink: replaces one sheet's data/meta (no-op when unchanged). */
    updateSheetData(
        sheetId: string,
        data: (string | null)[][],
        meta: Record<string, CellMeta>,
    ): void;
    setScouting(patch: Partial<Scouting>): void;
    setKeymapOverride(commandId: CommandId, chord: string): void;
    clearKeymapOverride(commandId: CommandId): void;
    setFlowFont(id: FontId): void;
    setRfdVim(on: boolean): void;
    setTheme(mode: ThemeMode): void;
    /** Sets one side's custom ink; null resets it to the theme default. */
    setSideColor(side: Side, color: string | null): void;
    /** Merges a partial update config, persisting the result. */
    setUpdateConfig(patch: Partial<UpdateConfig>): void;
    /**
     * Replaces every externally-syncable setting at once and persists all three
     * localStorage buckets. Used by the desktop config-file sync when the file
     * changes underneath the app; the caller suppresses the write-back so this
     * does not bounce straight back out to disk.
     */
    applyExternalConfig(config: AppConfig): void;
    /** Opens/closes the palette; `seed` sets the initial query (">" = command mode). */
    setQuickSwitcherOpen(open: boolean, seed?: string): void;
    setSettingsOpen(open: boolean): void;
    setCheatsheetOpen(open: boolean): void;
    setInfoOpen(open: boolean): void;
    setSidebarCollapsed(collapsed: boolean): void;
    setRfdOpen(open: boolean): void;
    setRenamingSheet(id: string | null): void;
}

export type FlowStore = FlowState & FlowActions;

/**
 * The full set of settings the desktop config file mirrors, in the store's own
 * camelCase vocabulary. The config module maps this to/from the plain-text file.
 */
export interface AppConfig {
    flowFont: FontId;
    sidebarCollapsed: boolean;
    rfdOpen: boolean;
    rfdVim: boolean;
    theme: ThemeMode;
    affColor: string | null;
    negColor: string | null;
    keymapOverrides: Record<string, string>;
    updateConfig: UpdateConfig;
}

// --- Settings persistence (localStorage) --------------------------------------

const KEYMAP_SETTINGS_KEY = "ebb-keymap-settings";
const DISPLAY_SETTINGS_KEY = "ebb-display-settings";

function loadKeymapOverrides(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(KEYMAP_SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as { keymapOverrides?: Record<string, string> };
        return parsed.keymapOverrides ?? {};
    } catch {
        return {};
    }
}

function saveKeymapOverrides(keymapOverrides: Record<string, string>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(KEYMAP_SETTINGS_KEY, JSON.stringify({ keymapOverrides }));
    } catch {
        // localStorage unavailable (private mode, quota) - ignore.
    }
}

interface DisplaySettings {
    flowFont: FontId;
    sidebarCollapsed: boolean;
    rfdOpen: boolean;
    rfdVim: boolean;
    theme: ThemeMode;
    affColor: string | null;
    negColor: string | null;
}

/** Accepts only a `#rrggbb` literal, the shape native color inputs emit. */
function resolveColor(value: unknown): string | null {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function loadDisplaySettings(): DisplaySettings {
    const fallback: DisplaySettings = {
        flowFont: DEFAULT_FONT_ID,
        sidebarCollapsed: false,
        rfdOpen: false,
        rfdVim: false,
        theme: "system",
        affColor: null,
        negColor: null,
    };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
        if (!raw) return fallback;
        const p = JSON.parse(raw) as Partial<DisplaySettings>;
        return {
            flowFont: resolveFontId(p.flowFont),
            sidebarCollapsed: typeof p.sidebarCollapsed === "boolean" ? p.sidebarCollapsed : false,
            rfdOpen: typeof p.rfdOpen === "boolean" ? p.rfdOpen : false,
            rfdVim: typeof p.rfdVim === "boolean" ? p.rfdVim : false,
            theme: resolveThemeMode(p.theme),
            affColor: resolveColor(p.affColor),
            negColor: resolveColor(p.negColor),
        };
    } catch {
        return fallback;
    }
}

function saveDisplaySettings(s: DisplaySettings): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(s));
    } catch {
        // ignore
    }
}

/** The persisted display fields as they currently stand in the store. */
function displaySettingsOf(s: FlowState): DisplaySettings {
    return {
        flowFont: s.flowFont,
        sidebarCollapsed: s.sidebarCollapsed,
        rfdOpen: s.rfdOpen,
        rfdVim: s.rfdVim,
        theme: s.theme,
        affColor: s.affColor,
        negColor: s.negColor,
    };
}

const initialDisplaySettings = loadDisplaySettings();

// --- Store ---------------------------------------------------------------------

/** A round copy with updatedAt bumped; every content edit routes through this. */
function touch(round: FlowRound): FlowRound {
    return { ...round, updatedAt: Date.now() };
}

/** The sheet id shown in the focused pane. */
export function focusedSheetId(
    s: Pick<FlowState, "activeSheetId" | "splitSheetId" | "focusedPane">,
): string | null {
    return s.splitSheetId != null && s.focusedPane === 2 ? s.splitSheetId : s.activeSheetId;
}

/**
 * Assign `sheetId` to the focused pane. In single mode that is just
 * `activeSheetId`. In split mode, picking the sheet already in the OTHER pane
 * swaps the two panes rather than showing a sheet twice.
 */
function assignFocused(
    s: Pick<FlowState, "activeSheetId" | "splitSheetId" | "focusedPane">,
    sheetId: string,
): { activeSheetId: string | null; splitSheetId: string | null } {
    if (s.splitSheetId == null) return { activeSheetId: sheetId, splitSheetId: null };
    const focusedCur = s.focusedPane === 1 ? s.activeSheetId : s.splitSheetId;
    const other = s.focusedPane === 1 ? s.splitSheetId : s.activeSheetId;
    const newOther = sheetId === other ? focusedCur : other;
    return s.focusedPane === 1
        ? { activeSheetId: sheetId, splitSheetId: newOther }
        : { activeSheetId: newOther, splitSheetId: sheetId };
}

export const useFlowStore = create<FlowStore>()((set, get) => ({
    round: null,
    activeSheetId: null,
    revealTarget: null,
    splitSheetId: null,
    focusedPane: 1,
    speechTarget: null,
    keymapOverrides: loadKeymapOverrides(),
    flowFont: initialDisplaySettings.flowFont,
    theme: initialDisplaySettings.theme,
    affColor: initialDisplaySettings.affColor,
    negColor: initialDisplaySettings.negColor,
    updateConfig: loadUpdateConfig(),
    quickSwitcherOpen: false,
    paletteSeed: "",
    settingsOpen: false,
    cheatsheetOpen: false,
    infoOpen: false,
    sidebarCollapsed: initialDisplaySettings.sidebarCollapsed,
    rfdOpen: initialDisplaySettings.rfdOpen,
    rfdVim: initialDisplaySettings.rfdVim,
    renamingSheetId: null,

    loadRound(round, opts) {
        set({
            round,
            activeSheetId:
                opts?.activeSheetId !== undefined ? opts.activeSheetId : firstFlowSheetId(round),
            splitSheetId: null,
            focusedPane: 1,
            // A brand-new flow always opens with the RFD drawer closed; an
            // existing flow restores the persisted preference. loadRound never
            // persists rfdOpen, so forcing it closed here stays transient.
            rfdOpen: opts?.newFlow ? false : loadDisplaySettings().rfdOpen,
            quickSwitcherOpen: false,
            renamingSheetId: null,
        });
    },

    addSheet(input) {
        const { round } = get();
        if (!round) return "";
        const maxOrder = round.sheets.length ? Math.max(...round.sheets.map((s) => s.order)) : -1;
        // Default title enumerates flow sheets per-side: the nth aff sheet is "n.".
        const count = round.sheets.filter(
            (s) => s.kind === "flow" && s.group === input.group,
        ).length;
        const title = input.title ?? `${count + 1}.`;
        const sheet = makeFlowSheet({ ...input, title, order: maxOrder + 1 });
        set({
            round: touch({ ...round, sheets: [...round.sheets, sheet] }),
            activeSheetId: sheet.id,
        });
        return sheet.id;
    },

    renameSheet(sheetId, title) {
        const { round } = get();
        if (!round) return;
        set({
            round: touch({
                ...round,
                sheets: round.sheets.map((s) => (s.id === sheetId ? { ...s, title } : s)),
            }),
        });
    },

    removeSheet(sheetId) {
        const { round, activeSheetId, splitSheetId } = get();
        if (!round) return null;
        const sheet = round.sheets.find((s) => s.id === sheetId);
        if (!sheet || sheet.kind === "cx") return null;

        const wasActive = activeSheetId === sheetId;
        const remaining = round.sheets.filter((s) => s.id !== sheetId);
        const nextRound = touch({ ...round, sheets: remaining });

        // Deleting a sheet that a split pane is showing collapses the split:
        // the surviving pane keeps its sheet, so the two panes never end up
        // pointing at the same sheet or at one that no longer exists.
        if (splitSheetId != null) {
            if (sheetId === splitSheetId) {
                set({ round: nextRound, splitSheetId: null, focusedPane: 1 });
            } else if (wasActive) {
                set({
                    round: nextRound,
                    activeSheetId: splitSheetId,
                    splitSheetId: null,
                    focusedPane: 1,
                });
            } else {
                set({ round: nextRound });
            }
            return { sheet, wasActive };
        }

        let nextActive = activeSheetId;
        if (wasActive) {
            const flows = remaining
                .filter((s) => s.kind !== "cx")
                .sort((a, b) => a.order - b.order);
            const below = flows.filter((s) => s.order < sheet.order).pop();
            nextActive = (below ?? flows[0])?.id ?? null;
        }
        set({ round: nextRound, activeSheetId: nextActive });
        return { sheet, wasActive };
    },

    restoreSheet(removed) {
        const { round } = get();
        if (!round) return;
        set({
            round: touch({ ...round, sheets: [...round.sheets, removed.sheet] }),
            ...(removed.wasActive ? { activeSheetId: removed.sheet.id } : {}),
        });
    },

    reorderSheets(orderedFlowSheetIds) {
        const { round } = get();
        if (!round) return;
        const orderById = new Map(orderedFlowSheetIds.map((id, i) => [id, i] as const));
        set({
            round: touch({
                ...round,
                sheets: round.sheets.map((s) =>
                    orderById.has(s.id) ? { ...s, order: orderById.get(s.id)! } : s,
                ),
            }),
        });
    },

    setActiveSheet(sheetId) {
        set(assignFocused(get(), sheetId));
    },

    revealCell(sheetId, row, col) {
        // A fresh object each call so the pane's effect re-fires even when the
        // same cell is revealed twice in a row.
        set({ ...assignFocused(get(), sheetId), revealTarget: { sheetId, row, col } });
    },

    switchSpeech(speechId) {
        const { round, splitSheetId } = get();
        if (!round) return;
        // A fresh speechTarget object re-fires the pane effect even for a
        // repeat pick of the same speech.
        if (splitSheetId != null) {
            // Split: apply to the focused pane; do not disturb which sheets show.
            set({ speechTarget: { speechId } });
            return;
        }
        const topId = firstFlowSheetId(round);
        if (!topId) return;
        set({ activeSheetId: topId, speechTarget: { speechId } });
    },

    toggleSplit() {
        const { round, splitSheetId, activeSheetId } = get();
        if (!round) return;
        if (splitSheetId != null) {
            set({ activeSheetId: focusedSheetId(get()), splitSheetId: null, focusedPane: 1 });
            return;
        }
        const order = sortedSheets(round);
        const i = order.findIndex((s) => s.id === activeSheetId);
        const next = order[i + 1] ?? order[i - 1];
        // No second sheet to show -> stay single-pane.
        if (!next) return;
        set({ splitSheetId: next.id, focusedPane: 1 });
    },

    focusPane(pane) {
        if (get().splitSheetId == null) return;
        set({ focusedPane: pane });
    },

    updateSheetData(sheetId, data, meta) {
        const { round } = get();
        if (!round) return;
        const sheet = round.sheets.find((s) => s.id === sheetId);
        if (!sheet) return;
        if (
            JSON.stringify(sheet.data) === JSON.stringify(data) &&
            JSON.stringify(sheet.meta) === JSON.stringify(meta)
        ) {
            return;
        }
        set({
            round: touch({
                ...round,
                sheets: round.sheets.map((s) => (s.id === sheetId ? { ...s, data, meta } : s)),
            }),
        });
    },

    setScouting(patch) {
        const { round } = get();
        if (!round) return;
        set({ round: touch({ ...round, scouting: { ...round.scouting, ...patch } }) });
    },

    setKeymapOverride(commandId, chord) {
        const keymapOverrides = { ...get().keymapOverrides, [commandId]: chord };
        saveKeymapOverrides(keymapOverrides);
        set({ keymapOverrides });
    },

    clearKeymapOverride(commandId) {
        const keymapOverrides = { ...get().keymapOverrides };
        delete keymapOverrides[commandId];
        saveKeymapOverrides(keymapOverrides);
        set({ keymapOverrides });
    },

    setFlowFont(id) {
        saveDisplaySettings({ ...displaySettingsOf(get()), flowFont: id });
        set({ flowFont: id });
    },

    setRfdVim(on) {
        saveDisplaySettings({ ...displaySettingsOf(get()), rfdVim: on });
        set({ rfdVim: on });
    },

    setTheme(mode) {
        saveDisplaySettings({ ...displaySettingsOf(get()), theme: mode });
        set({ theme: mode });
    },

    setSideColor(side, color) {
        const patch = side === "aff" ? { affColor: color } : { negColor: color };
        saveDisplaySettings({ ...displaySettingsOf(get()), ...patch });
        set(patch);
    },

    setUpdateConfig(patch) {
        const updateConfig = { ...get().updateConfig, ...patch };
        saveUpdateConfig(updateConfig);
        set({ updateConfig });
    },

    applyExternalConfig(config) {
        const { keymapOverrides, updateConfig, ...display } = config;
        saveDisplaySettings(display);
        saveKeymapOverrides(keymapOverrides);
        saveUpdateConfig(updateConfig);
        set({ ...display, keymapOverrides, updateConfig });
    },

    setQuickSwitcherOpen(open, seed = "") {
        set({ quickSwitcherOpen: open, paletteSeed: open ? seed : "" });
    },
    setSettingsOpen(open) {
        set({ settingsOpen: open });
    },
    setCheatsheetOpen(open) {
        set({ cheatsheetOpen: open });
    },
    setInfoOpen(open) {
        set({ infoOpen: open });
    },
    setSidebarCollapsed(collapsed) {
        saveDisplaySettings({ ...displaySettingsOf(get()), sidebarCollapsed: collapsed });
        set({ sidebarCollapsed: collapsed });
    },
    setRfdOpen(open) {
        saveDisplaySettings({ ...displaySettingsOf(get()), rfdOpen: open });
        set({ rfdOpen: open });
    },
    setRenamingSheet(id) {
        set({ renamingSheetId: id });
    },
}));
