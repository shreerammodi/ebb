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
    type CellMeta,
    type FlowRound,
    type FlowSheet,
} from "@/lib/model/flow";
import type { Scouting } from "@/lib/model/types";
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
    /** Grid cell the search palette asked to jump to; HotGrid selects it, then clears via a fresh set on the next reveal. */
    revealTarget: { row: number; col: number } | null;
    /** CommandId -> custom chord, overriding the preset binding. */
    keymapOverrides: Record<string, string>;
    flowFont: FontId;
    /** Desktop auto-update behavior (opt-in, Tournament Mode). */
    updateConfig: UpdateConfig;
    quickSwitcherOpen: boolean;
    commandPaletteOpen: boolean;
    settingsOpen: boolean;
    cheatsheetOpen: boolean;
    infoOpen: boolean;
    sidebarCollapsed: boolean;
    renamingSheetId: string | null;
}

export interface FlowActions {
    loadRound(round: FlowRound, opts?: { activeSheetId?: string | null }): void;
    addSheet(input: { title: string; group: "aff" | "neg" }): string;
    renameSheet(sheetId: string, title: string): void;
    removeSheet(sheetId: string): RemovedFlowSheet | null;
    restoreSheet(removed: RemovedFlowSheet): void;
    /** Renumbers the given flow sheets to contiguous order by array position. */
    reorderSheets(orderedFlowSheetIds: string[]): void;
    setActiveSheet(sheetId: string): void;
    /** Switch to a sheet and select one of its cells (used by the search palette). */
    revealCell(sheetId: string, row: number, col: number): void;
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
    /** Merges a partial update config, persisting the result. */
    setUpdateConfig(patch: Partial<UpdateConfig>): void;
    setQuickSwitcherOpen(open: boolean): void;
    setCommandPaletteOpen(open: boolean): void;
    setSettingsOpen(open: boolean): void;
    setCheatsheetOpen(open: boolean): void;
    setInfoOpen(open: boolean): void;
    setSidebarCollapsed(collapsed: boolean): void;
    setRenamingSheet(id: string | null): void;
}

export type FlowStore = FlowState & FlowActions;

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
}

function loadDisplaySettings(): DisplaySettings {
    const fallback: DisplaySettings = { flowFont: DEFAULT_FONT_ID, sidebarCollapsed: false };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
        if (!raw) return fallback;
        const p = JSON.parse(raw) as Partial<DisplaySettings>;
        return {
            flowFont: resolveFontId(p.flowFont),
            sidebarCollapsed: typeof p.sidebarCollapsed === "boolean" ? p.sidebarCollapsed : false,
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

const initialDisplaySettings = loadDisplaySettings();

// --- Store ---------------------------------------------------------------------

/** A round copy with updatedAt bumped; every content edit routes through this. */
function touch(round: FlowRound): FlowRound {
    return { ...round, updatedAt: Date.now() };
}

export const useFlowStore = create<FlowStore>()((set, get) => ({
    round: null,
    activeSheetId: null,
    revealTarget: null,
    keymapOverrides: loadKeymapOverrides(),
    flowFont: initialDisplaySettings.flowFont,
    updateConfig: loadUpdateConfig(),
    quickSwitcherOpen: false,
    commandPaletteOpen: false,
    settingsOpen: false,
    cheatsheetOpen: false,
    infoOpen: false,
    sidebarCollapsed: initialDisplaySettings.sidebarCollapsed,
    renamingSheetId: null,

    loadRound(round, opts) {
        set({
            round,
            activeSheetId:
                opts?.activeSheetId !== undefined ? opts.activeSheetId : firstFlowSheetId(round),
            quickSwitcherOpen: false,
            commandPaletteOpen: false,
            renamingSheetId: null,
        });
    },

    addSheet(input) {
        const { round } = get();
        if (!round) return "";
        const maxOrder = round.sheets.length ? Math.max(...round.sheets.map((s) => s.order)) : -1;
        const sheet = makeFlowSheet({ ...input, order: maxOrder + 1 });
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
        const { round, activeSheetId } = get();
        if (!round) return null;
        const sheet = round.sheets.find((s) => s.id === sheetId);
        if (!sheet || sheet.kind === "cx") return null;

        const wasActive = activeSheetId === sheetId;
        const remaining = round.sheets.filter((s) => s.id !== sheetId);
        let nextActive = activeSheetId;
        if (wasActive) {
            const flows = remaining
                .filter((s) => s.kind !== "cx")
                .sort((a, b) => a.order - b.order);
            const below = flows.filter((s) => s.order < sheet.order).pop();
            nextActive = (below ?? flows[0])?.id ?? null;
        }
        set({ round: touch({ ...round, sheets: remaining }), activeSheetId: nextActive });
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
        set({ activeSheetId: sheetId });
    },

    revealCell(sheetId, row, col) {
        // A fresh object each call so HotGrid's effect re-fires even when the
        // same cell is revealed twice in a row.
        set({ activeSheetId: sheetId, revealTarget: { row, col } });
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
        saveDisplaySettings({ flowFont: id, sidebarCollapsed: get().sidebarCollapsed });
        set({ flowFont: id });
    },

    setUpdateConfig(patch) {
        const updateConfig = { ...get().updateConfig, ...patch };
        saveUpdateConfig(updateConfig);
        set({ updateConfig });
    },

    setQuickSwitcherOpen(open) {
        set({ quickSwitcherOpen: open });
    },
    setCommandPaletteOpen(open) {
        set({ commandPaletteOpen: open });
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
        saveDisplaySettings({ flowFont: get().flowFont, sidebarCollapsed: collapsed });
        set({ sidebarCollapsed: collapsed });
    },
    setRenamingSheet(id) {
        set({ renamingSheetId: id });
    },
}));
