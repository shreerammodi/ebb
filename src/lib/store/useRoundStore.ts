/**
 * Zustand store for the active debate round.
 *
 * State is kept immutable — every action returns new objects/arrays so that
 * Zustand's shallow equality can detect changes reliably.
 */

import { create, type StoreApi } from "zustand";

import type { CommandId } from "@/lib/commands/registry";
import { type FontId, DEFAULT_FONT_ID, resolveFontId } from "@/lib/fonts/registry";
import { columnsForSheet } from "@/lib/grid/columns";
import {
    occupantAt,
    placeForSpawn,
    rippleDown,
    rippleUp,
    translateSubtree,
    translateUnit,
} from "@/lib/grid/coords";
import { isValidLinkTarget, linkRippleExclusions, linkSnapRow } from "@/lib/grid/move";
import {
    createTree,
    commit as commitHistory,
    undo as undoHistory,
    redo as redoHistory,
    jumpTo as jumpToHistoryTree,
    sealCurrent,
    currentRound,
    type HistoryTree,
} from "@/lib/history/tree";
import { detectDrops } from "@/lib/model/drops";
import { createGroup, removeMemberOrDelete } from "@/lib/model/groups";
import { unitHeadOf, unitKeyOf } from "@/lib/model/units";
import { uid } from "@/lib/model/ids";
import { emptyScouting, makeCxSheet } from "@/lib/model/normalize";
import {
    createSheet,
    renameSheet as renameSheetData,
    reorderSheets as reorderSheetsData,
    removeSheet as removeSheetData,
    restoreSheet as restoreSheetData,
} from "@/lib/model/sheets";
import {
    placeNodeAt,
    orphanNode,
    deleteSubtree as treeDeleteSubtree,
    updateText,
    toggleStatus,
    toggleBold,
    toggleHighlight,
    setParent,
    moveNode,
} from "@/lib/model/tree";
import type {
    Round,
    Sheet,
    ArgumentNode,
    ArgGroup,
    Format,
    Role,
    NodeStatus,
    Scouting,
} from "@/lib/model/types";
import { loadUpdateConfig, saveUpdateConfig } from "@/lib/update/settings";
import type { UpdateConfig } from "@/lib/update/types";

// ─── State shape ──────────────────────────────────────────────────────────────

export interface RoundState {
    round: Round | null;
    /** Branching undo history for the active round (null when no round). */
    history: HistoryTree | null;
    activeSheetId: string | null;
    /**
     * The focused cell as a grid coordinate. `nodeId` is derived via
     * `occupantAt` when needed, not stored directly.
     */
    selection: {
        sheetId: string;
        speechId: string;
        row: number;
    } | null;
    /** CommandId → custom chord, overriding the preset binding. */
    keymapOverrides: Record<string, string>;
    autoNumber: boolean;
    labelDrops: boolean;
    flowFont: FontId;
    /** Desktop auto-update behavior (opt-in, Tournament Mode). */
    updateConfig: UpdateConfig;
    quickSwitcherOpen: boolean;
    commandPaletteOpen: boolean;
    settingsOpen: boolean;
    cheatsheetOpen: boolean;
    guideOpen: boolean;
    renamingSheetId: string | null;
    infoOpen: boolean;
    /**
     * Keyboard "grab & move": the id of the argument currently being moved, or
     * null. While set, the grid is in move mode — cells are not editable, the
     * selection acts as a target cursor, and the grabbed node shows dimmed.
     */
    moveSource: string | null;
    /**
     * Mirror of {@link moveSource} for grab-to-link: the HEAD id of the unit
     * being linked, or null. While set, the grid is in link mode - cells are not
     * editable, the selection steers to the argument this one answers, and the
     * grabbed band shows dimmed.
     */
    linkSource: string | null;
    /** A node id to briefly flash (drop/move confirm), or null. Transient UI. */
    flashNodeId: string | null;
    /**
     * A deferred spawn that has not been typed into yet. Pressing Enter /
     * Shift+Enter moves the cursor to where the next cell WOULD go and arms
     * this intent instead of creating a node — the node is created only once the
     * user types the first character (see `commitPendingSpawn`). This keeps mashing
     * Enter (a habit from Excel) from littering the flow with empty nodes that then
     * get mislabeled as dropped.
     *
     * Enter arms a `continue` (the next cell of the SAME argument); a second Enter
     * on the untyped continuation cell flips it to a `break` (a NEW argument below
     * the source unit's band) via `breakPendingSpawn`. `sourceHeadId` records the
     * unit Enter was pressed on so the break can re-target against it.
     *
     * When the target cell was occupied, the surrounding cells are shifted down
     * immediately so the target reads as empty. `preSpawnNodes` captures the
     * exact node array before that shift so both commit and abandon can restore
     * the pre-spawn flow without replaying the shift in reverse (which would be
     * fragile when the ripple excluded the parent chain). The shift is applied
     * without bumping `round.updatedAt`, so it stays out of autosave and undo
     * history until commit.
     */
    pendingSpawn: {
        sheetId: string;
        speechId: string;
        row: number;
        /** Parent link the committed node will carry. */
        parentId: string | null;
        /** Unit the committed node joins; null = it starts its own unit. */
        unitKey: string | null;
        /**
         * continue - Enter: next cell of the same argument.
         * break    - double-Enter: a NEW argument below the source unit's band,
         *            inheriting the source unit's parent (new root during
         *            transcription, new numbered sibling answer inside a band).
         * response - Shift+Enter: answers the source UNIT's head.
         */
        kind: "continue" | "break" | "response";
        /** Head id of the unit Enter was pressed on; lets the latch break. */
        sourceHeadId: string | null;
        /** The node array immediately before the transient shift; undefined when no shift was needed. */
        preSpawnNodes: ArgumentNode[] | undefined;
    } | null;
    sidebarCollapsed: boolean;
}

/**
 * Everything needed to put a deleted sheet back exactly where it was: the sheet
 * itself (its original `order` restores its position), the arguments it held,
 * the groups scoped to it, and whether it was active. Returned by `removeSheet`
 * so the caller can offer a discoverable Undo without relying on the global
 * history stack (which is order-dependent if the user edits in the meantime).
 */
export interface RemovedSheet {
    sheet: Sheet;
    nodes: ArgumentNode[];
    groups: ArgGroup[];
    wasActive: boolean;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export interface RoundActions {
    createRound(input: { role: Role; format: Format }): void;
    /**
     * Replaces the active round wholesale (load from DB, import from file). Resets
     * undo history and all transient state; `activeSheetId`/`selection` default to
     * null unless provided. This is the single entry point for swapping the whole
     * document, as opposed to `_commit` for incremental edits.
     */
    loadRound(
        round: Round,
        opts?: {
            activeSheetId?: string | null;
            selection?: RoundState["selection"];
            /** Seed history (e.g. restored from IndexedDB); fresh tree if absent. */
            history?: HistoryTree;
        },
    ): void;

    addSheet(input: { title: string; group: "aff" | "neg" }): string;
    renameSheet(sheetId: string, title: string): void;
    /** Removes a sheet (and its nodes/groups), returning a payload for Undo. */
    removeSheet(sheetId: string): RemovedSheet | null;
    /** Re-inserts a previously removed sheet at its original position. */
    restoreSheet(removed: RemovedSheet): void;
    /** Renumbers the given flow sheets to contiguous `order` by array position. */
    reorderSheets(orderedFlowSheetIds: string[]): void;
    setActiveSheet(sheetId: string): void;

    addNode(input: {
        sheetId: string;
        speechId: string;
        parentId: string | null;
        row?: number;
        text?: string;
    }): string;
    updateNodeText(nodeId: string, text: string): void;
    toggleNodeStatus(nodeId: string, status: NodeStatus): void;
    toggleNodeBold(nodeId: string): void;
    toggleNodeHighlight(nodeId: string): void;
    setNodeParent(nodeId: string, parentId: string | null): void;

    placeBareNode(cell: { sheetId: string; speechId: string; row: number }, text?: string): string;
    /**
     * Arms a deferred continuation spawn: moves the cursor to the cell below the
     * current one (the next cell of the SAME argument) and sets `pendingSpawn`.
     * Does NOT create a node — `commitPendingSpawn` does, on the first keystroke.
     * No-ops (returns null) when there is no occupant at the cursor or a spawn is
     * already pending. Always returns null (no node yet).
     */
    spawnSibling(): string | null;
    /** Like {@link spawnSibling} but for a response answering the unit head. */
    spawnResponse(): string | null;
    /**
     * Flips an armed continuation into a NEW-argument spawn (the double-Enter
     * latch): reverses the continuation's transient shift, re-targets the cell
     * below the source unit's whole band, and re-arms. No-op unless a
     * "continue" spawn is armed.
     */
    breakPendingSpawn(): void;
    /** Creates the pending-spawn node with `text`; returns its id, or null. */
    commitPendingSpawn(text: string): string | null;
    /** Discards a pending spawn, reversing any shift it applied. */
    abandonPendingSpawn(): void;
    insertRowAbove(): void;
    insertRowBelow(): void;
    deleteRow(): void;
    clearCell(): void;
    deleteSubtreeAt(): void;
    /**
     * Translate the subtree rooted at `nodeId` by (dCol, dRow). Returns true
     * on success, false if the move was rejected (collision / out of bounds).
     */
    commitSubtreeMove(dCol: number, dRow: number, nodeId?: string): boolean;
    /** Move a single node to a new cell (no subtree translation). */
    moveCellTo(nodeId: string, speechId: string, row: number): void;

    groupNodes(sheetId: string, nodeIds: string[], label: string): void;
    ungroupNode(nodeId: string): void;

    setSelection(
        selection: {
            sheetId: string;
            speechId: string;
            row: number;
        } | null,
    ): void;

    undo(): void;
    redo(): void;
    /** @internal `_commit` and `_reconcileAfterHistory` are store-private plumbing — do not call them outside the store's own action implementations. */
    /** Internal: snapshot the current round, then replace it via `producer`. */
    _commit(coalesceKey: string | null, producer: (round: Round) => Round, label?: string): void;
    /** Jump the undo tree directly to a node by id (panel click). */
    jumpToHistory(nodeId: string): void;
    /** Internal: drop selection/activeSheet if they point at something now gone. */
    _reconcileAfterHistory(): void;

    setKeymapOverride(commandId: CommandId, chord: string): void;
    clearKeymapOverride(commandId: CommandId): void;
    setAutoNumber(v: boolean): void;
    setLabelDrops(v: boolean): void;
    setFlowFont: (id: FontId) => void;
    /** Merges a partial update config, persisting the result. */
    setUpdateConfig(patch: Partial<UpdateConfig>): void;
    setQuickSwitcherOpen(open: boolean): void;
    setCommandPaletteOpen(open: boolean): void;
    setSettingsOpen(open: boolean): void;
    setCheatsheetOpen(open: boolean): void;
    setGuideOpen(open: boolean): void;
    setRenamingSheet(id: string | null): void;
    setInfoOpen(open: boolean): void;
    setSidebarCollapsed(collapsed: boolean): void;
    setMoveSource(id: string | null): void;
    /** Arms/disarms grab-to-link. Pass the grabbed unit's HEAD id. */
    setLinkSource(id: string | null): void;
    /**
     * Links the grabbed unit to the unit under the selection and snaps its
     * whole band beside the new parent (speechId never changes; vertical
     * translation only). Dropping on the grabbed unit itself unlinks it in
     * place. Returns false - leaving link mode armed - when the target is
     * invalid (empty cell, same/later column, own band).
     */
    commitLink(): boolean;
    setFlashNode(id: string | null): void;

    setScouting(patch: Partial<Scouting>): void;
}

export type RoundStore = RoundState & RoundActions;

// ─── Keymap settings persistence ────────────────────────────────────────────

const KEYMAP_SETTINGS_KEY = "df-keymap-settings";

interface KeymapSettings {
    keymapOverrides: Record<string, string>;
}

/** Loads persisted keymap settings from localStorage (SSR-safe). */
function loadKeymapSettings(): KeymapSettings {
    const fallback: KeymapSettings = {
        keymapOverrides: {},
    };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(KEYMAP_SETTINGS_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<KeymapSettings>;
        return {
            keymapOverrides: parsed.keymapOverrides ?? fallback.keymapOverrides,
        };
    } catch {
        return fallback;
    }
}

/** Persists keymap settings to localStorage (SSR-safe; failures ignored). */
function saveKeymapSettings(settings: KeymapSettings): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(KEYMAP_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // localStorage unavailable (private mode, quota) — ignore.
    }
}

// ─── Display settings persistence ───────────────────────────────────────────

const DISPLAY_SETTINGS_KEY = "df-display-settings";

interface DisplaySettings {
    autoNumber: boolean;
    labelDrops: boolean;
    flowFont: FontId;
    sidebarCollapsed: boolean;
}

function loadDisplaySettings(): DisplaySettings {
    const fallback: DisplaySettings = {
        autoNumber: true,
        labelDrops: true,
        flowFont: DEFAULT_FONT_ID,
        sidebarCollapsed: false,
    };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
        if (!raw) return fallback;
        const p = JSON.parse(raw) as Partial<DisplaySettings>;
        return {
            autoNumber: typeof p.autoNumber === "boolean" ? p.autoNumber : true,
            labelDrops: typeof p.labelDrops === "boolean" ? p.labelDrops : true,
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
        /* ignore */
    }
}

const initialDisplaySettings = loadDisplaySettings();
const initialUpdateConfig = loadUpdateConfig();

// ─── Store ────────────────────────────────────────────────────────────────────

const initialKeymapSettings = loadKeymapSettings();

/**
 * Shared core of `spawnSibling` / `spawnResponse`. Resolves the target slot, opens
 * it by shifting cells down when occupied — transiently, without bumping
 * `updatedAt`, so the shift is neither autosaved nor pushed to undo history — moves
 * the cursor there, and arms `pendingSpawn`. Creates no node; that waits for the
 * first keystroke via `commitPendingSpawn`. Returns null (no node yet).
 */
function armSpawn(
    get: StoreApi<RoundStore>["getState"],
    set: StoreApi<RoundStore>["setState"],
    kind: "continue" | "response",
): null {
    const { round, selection, pendingSpawn } = get();
    // One pending spawn at a time; spawn only from a real node (so a second Enter
    // on the now-empty target naturally no-ops and mashing Enter doesn't cascade).
    if (!round || !selection || pendingSpawn) return null;
    const cur = occupantAt(round.nodes, selection.sheetId, selection.speechId, selection.row);
    if (!cur) return null;
    const sheet = round.sheets.find((s) => s.id === selection.sheetId);
    if (!sheet) return null;
    const speeches = columnsForSheet(round.format, sheet);
    const placed = placeForSpawn(round.nodes, selection.sheetId, speeches, cur, kind);
    if (!placed) return null;
    const head = unitHeadOf(round.nodes, cur);
    // placeForSpawn returns the same array reference when no shift was needed.
    const shifted = placed.nodes !== round.nodes;
    set({
        round: shifted ? { ...round, nodes: placed.nodes } : round,
        selection: {
            sheetId: selection.sheetId,
            speechId: placed.speechId,
            row: placed.row,
        },
        pendingSpawn: {
            sheetId: selection.sheetId,
            speechId: placed.speechId,
            row: placed.row,
            parentId: kind === "response" ? head.id : null,
            unitKey: kind === "continue" ? unitKeyOf(cur) : null,
            kind,
            sourceHeadId: head.id,
            preSpawnNodes: shifted ? round.nodes : undefined,
        },
    });
    return null;
}

export const useRoundStore = create<RoundStore>((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────────
    round: null,
    history: null,
    activeSheetId: null,
    selection: null,
    keymapOverrides: initialKeymapSettings.keymapOverrides,
    autoNumber: initialDisplaySettings.autoNumber,
    labelDrops: initialDisplaySettings.labelDrops,
    flowFont: initialDisplaySettings.flowFont,
    updateConfig: initialUpdateConfig,
    sidebarCollapsed: initialDisplaySettings.sidebarCollapsed,
    quickSwitcherOpen: false,
    commandPaletteOpen: false,
    settingsOpen: false,
    cheatsheetOpen: false,
    guideOpen: false,
    renamingSheetId: null,
    infoOpen: false,
    moveSource: null,
    linkSource: null,
    flashNodeId: null,
    pendingSpawn: null,

    // ── createRound ────────────────────────────────────────────────────────────
    createRound({ role, format }) {
        const now = Date.now();
        const round: Round = {
            id: uid("round"),
            createdAt: now,
            updatedAt: now,
            role,
            format,
            scouting: emptyScouting(),
            sheets: [makeCxSheet()],
            nodes: [],
            groups: [],
        };
        set({
            round,
            history: createTree(round, "New round"),
            activeSheetId: null,
            selection: null,
            quickSwitcherOpen: false,
            commandPaletteOpen: false,
            settingsOpen: false,
            cheatsheetOpen: false,
            guideOpen: false,
            renamingSheetId: null,
            infoOpen: false,
            moveSource: null,
            linkSource: null,
            flashNodeId: null,
            pendingSpawn: null,
        });
    },

    // ── loadRound ──────────────────────────────────────────────────────────────
    loadRound(round, opts) {
        set({
            round,
            history: opts?.history ?? createTree(round),
            activeSheetId: opts?.activeSheetId ?? null,
            selection: opts?.selection ?? null,
            pendingSpawn: null,
            moveSource: null,
            linkSource: null,
            flashNodeId: null,
        });
    },

    // ── addSheet ───────────────────────────────────────────────────────────────
    addSheet({ title, group }) {
        const { round } = get();
        if (!round) throw new Error("No active round");

        const sheet = createSheet(round.sheets, round.format, { title, group });

        const isFirstFlow = round.sheets.filter((s) => s.kind !== "cx").length === 0;
        get()._commit(null, (r) => ({ ...r, sheets: [...r.sheets, sheet] }), "Add sheet");
        if (isFirstFlow) set({ activeSheetId: sheet.id });

        return sheet.id;
    },

    // ── renameSheet ────────────────────────────────────────────────────────────
    renameSheet(sheetId, title) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                sheets: renameSheetData(r.sheets, sheetId, title),
            }),
            "Rename sheet",
        );
    },

    // ── removeSheet ────────────────────────────────────────────────────────────
    removeSheet(sheetId) {
        const { round, activeSheetId, selection } = get();
        if (!round) return null;

        const sheet = round.sheets.find((s) => s.id === sheetId);
        if (!sheet) return null;

        // Capture what we're about to drop so the caller can offer Undo.
        const removedNodes = round.nodes.filter((n) => n.sheetId === sheetId);
        const removedGroups = round.groups.filter((g) => g.sheetId === sheetId);
        const wasActive = activeSheetId === sheetId;

        get()._commit(
            null,
            (r) => ({
                ...r,
                ...removeSheetData(r.sheets, r.nodes, r.groups, sheetId),
            }),
            "Delete sheet",
        );
        if (wasActive) {
            const remaining = round.sheets.filter((s) => s.id !== sheetId);
            const nextActive = remaining.find((s) => s.kind !== "cx") ?? remaining[0] ?? null;
            set({ activeSheetId: nextActive?.id ?? null });
        }
        if (selection?.sheetId === sheetId) set({ selection: null });

        return { sheet, nodes: removedNodes, groups: removedGroups, wasActive };
    },

    // ── restoreSheet ───────────────────────────────────────────────────────────
    restoreSheet(removed) {
        const { round } = get();
        if (!round) return;
        // Guard against a double restore (e.g. Undo clicked twice).
        if (round.sheets.some((s) => s.id === removed.sheet.id)) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                ...restoreSheetData(
                    r.sheets,
                    r.nodes,
                    r.groups,
                    removed.sheet,
                    removed.nodes,
                    removed.groups,
                ),
            }),
            "Restore sheet",
        );
        if (removed.wasActive) set({ activeSheetId: removed.sheet.id });
    },

    // ── reorderSheets ──────────────────────────────────────────────────────────
    /**
     * Renumbers the listed flow sheets to contiguous `order` (0, 1, 2, …) by
     * their position in the array. Sheets not in the list (e.g. the pinned CX
     * sheet) and every sheet's `group` are left untouched.
     */
    reorderSheets(orderedFlowSheetIds) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                sheets: reorderSheetsData(r.sheets, orderedFlowSheetIds),
            }),
            "Reorder sheets",
        );
    },

    // ── setActiveSheet ─────────────────────────────────────────────────────────
    setActiveSheet(sheetId) {
        set({ activeSheetId: sheetId });
    },

    // ── addNode (legacy wrapper, prefer placeBareNode) ──────────────────────
    addNode(input) {
        const { round } = get();
        if (!round) throw new Error("No active round");
        const row = input.row ?? 0;
        const { nodes, node } = placeNodeAt(round.nodes, {
            sheetId: input.sheetId,
            speechId: input.speechId,
            parentId: input.parentId,
            row,
            text: input.text,
        });
        // Coalesce key matches updateNodeText's so the new cell and the initial
        // typing burst collapse into one "Add" undo step (see updateNodeText).
        get()._commit(`text:${node.id}`, (r) => ({ ...r, nodes }), "Add");
        return node.id;
    },

    // ── updateNodeText ─────────────────────────────────────────────────────────
    updateNodeText(nodeId, text) {
        if (!get().round) return;
        get()._commit(
            `text:${nodeId}`,
            (r) => ({
                ...r,
                nodes: updateText(r.nodes, nodeId, text),
            }),
            "Type",
        );
    },

    // ── toggleNodeStatus ───────────────────────────────────────────────────────
    toggleNodeStatus(nodeId, status) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: toggleStatus(r.nodes, nodeId, status),
            }),
            "Status",
        );
    },

    // ── toggleNodeBold ─────────────────────────────────────────────────────────
    toggleNodeBold(nodeId) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: toggleBold(r.nodes, nodeId),
            }),
            "Bold",
        );
    },

    // ── toggleNodeHighlight ──────────────────────────────────────────────────────
    toggleNodeHighlight(nodeId) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: toggleHighlight(r.nodes, nodeId),
            }),
            "Highlight",
        );
    },

    // ── setNodeParent ──────────────────────────────────────────────────────────
    setNodeParent(nodeId, parentId) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: setParent(r.nodes, nodeId, parentId),
            }),
            "Re-parent",
        );
    },

    // ── Coordinate-based actions ──────────────────────────────────────────────

    placeBareNode(cell, text) {
        const { round } = get();
        if (!round) throw new Error("No active round");
        const { nodes, node } = placeNodeAt(round.nodes, {
            ...cell,
            parentId: null,
            text,
        });
        // See addNode: the text coalesce key merges the follow-on typing burst
        // into this single "Add" node instead of branching a "Type" node.
        get()._commit(`text:${node.id}`, (r) => ({ ...r, nodes }), "Add");
        return node.id;
    },

    spawnSibling() {
        return armSpawn(get, set, "continue");
    },

    spawnResponse() {
        return armSpawn(get, set, "response");
    },

    breakPendingSpawn() {
        const { round, pendingSpawn } = get();
        if (!round || !pendingSpawn || pendingSpawn.kind !== "continue") return;
        // Reverse the continuation's transient shift before re-targeting, so
        // the break placement computes against the true pre-spawn flow.
        const baseNodes = pendingSpawn.preSpawnNodes ?? round.nodes;
        const head = baseNodes.find((n) => n.id === pendingSpawn.sourceHeadId);
        if (!head) {
            set({ round: { ...round, nodes: baseNodes }, pendingSpawn: null });
            return;
        }
        const sheet = round.sheets.find((s) => s.id === pendingSpawn.sheetId);
        if (!sheet) return;
        const speeches = columnsForSheet(round.format, sheet);
        const placed = placeForSpawn(baseNodes, pendingSpawn.sheetId, speeches, head, "sibling");
        if (!placed) return;
        const shifted = placed.nodes !== baseNodes;
        set({
            round: { ...round, nodes: placed.nodes },
            selection: {
                sheetId: pendingSpawn.sheetId,
                speechId: placed.speechId,
                row: placed.row,
            },
            pendingSpawn: {
                sheetId: pendingSpawn.sheetId,
                speechId: placed.speechId,
                row: placed.row,
                parentId: head.parentId,
                unitKey: null,
                kind: "break",
                sourceHeadId: null,
                preSpawnNodes: shifted ? baseNodes : undefined,
            },
        });
    },

    commitPendingSpawn(text) {
        const { round, history, pendingSpawn } = get();
        if (!round || !history || !pendingSpawn) return null;
        const { sheetId, speechId, row, parentId, unitKey } = pendingSpawn;
        const { nodes, node } = placeNodeAt(round.nodes, {
            sheetId,
            speechId,
            parentId,
            row,
            text,
            ...(unitKey !== null ? { unitId: unitKey } : {}),
        });
        // The transient shift was applied outside history, so the current history
        // node still holds the pre-spawn flow. Committing the post-spawn round as a
        // single child means one undo returns to the exact pre-spawn state.
        const next = { ...round, nodes, updatedAt: Date.now() };
        set({
            round: next,
            // Text coalesce key so the spawned cell and its first keystrokes
            // collapse into one "Add" undo step (see addNode / updateNodeText).
            history: commitHistory(history, next, `text:${node.id}`, "Add"),
            pendingSpawn: null,
        });
        return node.id;
    },

    abandonPendingSpawn() {
        const { round, pendingSpawn } = get();
        if (!pendingSpawn) return;
        // Restore the exact pre-spawn nodes (if any shift was applied) without
        // bumping updatedAt, then drop the intent. The flow returns to exactly
        // its pre-spawn state.
        if (round && pendingSpawn.preSpawnNodes !== undefined) {
            set({
                round: { ...round, nodes: pendingSpawn.preSpawnNodes },
                pendingSpawn: null,
            });
        } else {
            set({ pendingSpawn: null });
        }
    },

    insertRowAbove() {
        const { round, selection } = get();
        if (!round || !selection) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: rippleDown(r.nodes, selection.sheetId, selection.row, 1),
            }),
            "Insert row",
        );
    },

    insertRowBelow() {
        const { round, selection } = get();
        if (!round || !selection) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: rippleDown(r.nodes, selection.sheetId, selection.row + 1, 1),
            }),
            "Insert row",
        );
    },

    deleteRow() {
        const { round, selection } = get();
        if (!round || !selection) return;
        get()._commit(
            null,
            (r) => {
                const kept = r.nodes.filter(
                    (n) => !(n.sheetId === selection.sheetId && n.row === selection.row),
                );
                return {
                    ...r,
                    nodes: rippleUp(kept, selection.sheetId, selection.row + 1, 1),
                };
            },
            "Delete row",
        );
    },

    clearCell() {
        const { round, selection } = get();
        if (!round || !selection) return;
        const cur = occupantAt(round.nodes, selection.sheetId, selection.speechId, selection.row);
        if (!cur) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: orphanNode(r.nodes, cur.id),
                groups: removeMemberOrDelete(r.groups, cur.id),
            }),
            "Clear cell",
        );
    },

    deleteSubtreeAt() {
        const { round, selection } = get();
        if (!round || !selection) return;
        const cur = occupantAt(round.nodes, selection.sheetId, selection.speechId, selection.row);
        if (!cur) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: treeDeleteSubtree(r.nodes, cur.id),
            }),
            "Delete subtree",
        );
    },

    commitSubtreeMove(dCol, dRow, nodeId) {
        const { round, moveSource } = get();
        if (!round) return false;
        const id = nodeId ?? moveSource;
        if (!id) return false;
        // Determine speeches from the node's own sheet.
        const refNode = round.nodes.find((n) => n.id === id);
        if (!refNode) return false;
        const sheet = round.sheets.find((s) => s.id === refNode.sheetId);
        if (!sheet) return false;
        const speeches = columnsForSheet(round.format, sheet);
        const { nodes, ok } = translateSubtree(round.nodes, speeches, id, dCol, dRow);
        if (!ok) return false;
        get()._commit(null, (r) => ({ ...r, nodes }), "Move");
        return true;
    },

    setLinkSource(id) {
        set({ linkSource: id });
    },

    commitLink() {
        const { round, linkSource, selection } = get();
        if (!round || !linkSource || !selection) return false;
        const head = round.nodes.find((n) => n.id === linkSource);
        if (!head) return false;
        const sheet = round.sheets.find((s) => s.id === head.sheetId);
        if (!sheet) return false;
        const speeches = columnsForSheet(round.format, sheet);
        const occ = occupantAt(round.nodes, selection.sheetId, selection.speechId, selection.row);
        if (!occ || occ.sheetId !== head.sheetId) return false;

        // Dropping on the grabbed unit itself clears its link, in place.
        if (unitKeyOf(occ) === unitKeyOf(head)) {
            if (head.parentId !== null) {
                get()._commit(
                    null,
                    (r) => ({ ...r, nodes: setParent(r.nodes, head.id, null) }),
                    "Unlink",
                );
            }
            return true;
        }

        if (!isValidLinkTarget(round.nodes, speeches, head.id, occ.id)) return false;
        const parentHead = unitHeadOf(round.nodes, occ);
        const targetRow = linkSnapRow(round.nodes, head.id, parentHead.id);
        if (targetRow === null) return false;

        const withParent = setParent(round.nodes, head.id, parentHead.id);
        const { nodes, ok } = translateUnit(
            withParent,
            speeches,
            head.id,
            targetRow - head.row,
            linkRippleExclusions(withParent, parentHead.id),
        );
        if (!ok) return false;
        get()._commit(null, (r) => ({ ...r, nodes }), "Link");
        return true;
    },

    /** Move a single node to a new cell (no subtree translation). */
    moveCellTo(nodeId, speechId, row) {
        const { round } = get();
        if (!round) return;
        const node = round.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        // Reject collision with another node.
        const collide = round.nodes.some(
            (n) =>
                n.id !== nodeId &&
                n.sheetId === node.sheetId &&
                n.speechId === speechId &&
                n.row === row,
        );
        if (collide) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                nodes: moveNode(r.nodes, nodeId, speechId, row),
            }),
            "Move",
        );
    },

    // ── groupNodes ─────────────────────────────────────────────────────────────
    groupNodes(sheetId, nodeIds, label) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                groups: createGroup(r.groups, {
                    sheetId,
                    memberIds: nodeIds,
                    label,
                }),
            }),
            "Group",
        );
    },

    // ── ungroupNode ────────────────────────────────────────────────────────────
    ungroupNode(nodeId) {
        if (!get().round) return;
        get()._commit(
            null,
            (r) => ({
                ...r,
                groups: removeMemberOrDelete(r.groups, nodeId),
            }),
            "Ungroup",
        );
    },

    // ── setSelection ───────────────────────────────────────────────────────────
    setSelection(selection) {
        // Moving the cursor off an armed-but-untyped spawn abandons it (reversing
        // any shift). Staying on the same cell keeps it armed so the editor there
        // can still receive the first keystroke.
        const { pendingSpawn } = get();
        if (pendingSpawn) {
            const sameCell =
                selection !== null &&
                selection.sheetId === pendingSpawn.sheetId &&
                selection.speechId === pendingSpawn.speechId &&
                selection.row === pendingSpawn.row;
            if (!sameCell) get().abandonPendingSpawn();
        }
        const { history } = get();
        set({ selection, history: history ? sealCurrent(history) : history });
    },

    // ── undo/redo plumbing ───────────────────────────────────────────────────────
    // commit(coalesceKey, producer): snapshot current round, then replace it.
    // When coalesceKey matches the previous commit's key, the snapshot is reused
    // (the prior edits collapse into one undo step).
    _commit(coalesceKey, producer, label = "Edit") {
        const { round, history } = get();
        if (!round || !history) return;
        const next = { ...producer(round), updatedAt: Date.now() };
        set({
            round: next,
            history: commitHistory(history, next, coalesceKey, label),
        });
    },

    undo() {
        const { history } = get();
        if (!history) return;
        const moved = undoHistory(history);
        if (moved === history) return;
        set({ round: currentRound(moved), history: moved });
        get()._reconcileAfterHistory();
    },

    redo() {
        const { history } = get();
        if (!history) return;
        const moved = redoHistory(history);
        if (moved === history) return;
        set({ round: currentRound(moved), history: moved });
        get()._reconcileAfterHistory();
    },

    jumpToHistory(nodeId) {
        const { history } = get();
        if (!history) return;
        const moved = jumpToHistoryTree(history, nodeId);
        if (moved === history) return;
        set({ round: currentRound(moved), history: moved });
        get()._reconcileAfterHistory();
    },

    // After undo/redo, drop selection/activeSheet if they now point at something gone.
    _reconcileAfterHistory() {
        const { round, activeSheetId, selection } = get();
        if (!round) return;
        const sheetExists = (id: string | null) => !!id && round.sheets.some((s) => s.id === id);
        const nextActive = sheetExists(activeSheetId)
            ? activeSheetId
            : (round.sheets.find((s) => s.kind !== "cx")?.id ?? round.sheets[0]?.id ?? null);
        const selValid = selection && round.sheets.some((s) => s.id === selection.sheetId);
        set({
            activeSheetId: nextActive,
            selection: selValid ? selection : null,
            // undo/redo swaps the whole round, discarding any transient shift, so a
            // stale pending spawn must be dropped outright.
            pendingSpawn: null,
            linkSource: null,
        });
    },

    // ── setKeymapOverride ──────────────────────────────────────────────────────
    setKeymapOverride(commandId, chord) {
        const overrides = { ...get().keymapOverrides, [commandId]: chord };
        set({ keymapOverrides: overrides });
        saveKeymapSettings({
            keymapOverrides: overrides,
        });
    },

    // ── clearKeymapOverride ────────────────────────────────────────────────────
    clearKeymapOverride(commandId) {
        const overrides = { ...get().keymapOverrides };
        delete overrides[commandId];
        set({ keymapOverrides: overrides });
        saveKeymapSettings({
            keymapOverrides: overrides,
        });
    },

    // ── setAutoNumber ──────────────────────────────────────────────────────────
    setAutoNumber(v) {
        set({ autoNumber: v });
        saveDisplaySettings({
            autoNumber: v,
            labelDrops: get().labelDrops,
            flowFont: get().flowFont,
            sidebarCollapsed: get().sidebarCollapsed,
        });
    },

    // ── setLabelDrops ──────────────────────────────────────────────────────────
    setLabelDrops(v) {
        set({ labelDrops: v });
        saveDisplaySettings({
            autoNumber: get().autoNumber,
            labelDrops: v,
            flowFont: get().flowFont,
            sidebarCollapsed: get().sidebarCollapsed,
        });
    },

    // ── setFlowFont ──────────────────────────────────────────────────────────
    setFlowFont(id) {
        set({ flowFont: id });
        saveDisplaySettings({
            autoNumber: get().autoNumber,
            labelDrops: get().labelDrops,
            flowFont: id,
            sidebarCollapsed: get().sidebarCollapsed,
        });
    },

    // ── setUpdateConfig ────────────────────────────────────────────────────────
    setUpdateConfig(patch) {
        const next = { ...get().updateConfig, ...patch };
        set({ updateConfig: next });
        saveUpdateConfig(next);
    },

    // ── setSidebarCollapsed ────────────────────────────────────────────────────
    setSidebarCollapsed(collapsed) {
        set({ sidebarCollapsed: collapsed });
        saveDisplaySettings({
            autoNumber: get().autoNumber,
            labelDrops: get().labelDrops,
            flowFont: get().flowFont,
            sidebarCollapsed: collapsed,
        });
    },

    // ── setQuickSwitcherOpen ───────────────────────────────────────────────────
    setQuickSwitcherOpen(open) {
        set({ quickSwitcherOpen: open });
    },

    // ── setCommandPaletteOpen ──────────────────────────────────────────────────
    setCommandPaletteOpen(open) {
        set({ commandPaletteOpen: open });
    },

    // ── setSettingsOpen ────────────────────────────────────────────────────────
    setSettingsOpen(open) {
        set({ settingsOpen: open });
    },

    // ── setCheatsheetOpen ──────────────────────────────────────────────────────
    setCheatsheetOpen(open) {
        set({ cheatsheetOpen: open });
    },

    // ── setGuideOpen ───────────────────────────────────────────────────────────
    setGuideOpen(open) {
        set({ guideOpen: open });
    },

    // ── setRenamingSheet ───────────────────────────────────────────────────────
    setRenamingSheet(id) {
        set({ renamingSheetId: id });
    },

    // ── setMoveSource ──────────────────────────────────────────────────────────
    setMoveSource(id) {
        set({ moveSource: id });
    },

    // ── setFlashNode ───────────────────────────────────────────────────────────
    setFlashNode(id) {
        set({ flashNodeId: id });
    },

    // ── setInfoOpen ────────────────────────────────────────────────────────────
    setInfoOpen(open) {
        set({ infoOpen: open });
    },

    // ── setScouting ────────────────────────────────────────────────────────────
    setScouting(patch) {
        if (!get().round) return;
        get()._commit(
            "scouting",
            (r) => ({
                ...r,
                scouting: { ...r.scouting, ...patch },
            }),
            "Scouting",
        );
    },
}));

// ─── Pure selector helpers ────────────────────────────────────────────────────

/** Returns ids of dropped nodes on the given sheet, or [] if round is null. */
export function selectDrops(round: Round | null, sheetId: string): string[] {
    if (!round) return [];
    return detectDrops(round.nodes, round.format, sheetId);
}

/** Returns the count of dropped nodes on the given sheet, or 0 if round is null. */
export function selectSheetDropCount(round: Round | null, sheetId: string): number {
    return selectDrops(round, sheetId).length;
}
