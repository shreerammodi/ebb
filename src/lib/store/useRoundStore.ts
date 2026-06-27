/**
 * Zustand store for the active debate round.
 *
 * State is kept immutable — every action returns new objects/arrays so that
 * Zustand's shallow equality can detect changes reliably.
 */

import { create } from "zustand";
import type { CommandId } from "@/lib/commands/registry";
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
import { uid } from "@/lib/model/ids";
import { emptyScouting, makeCxSheet } from "@/lib/model/normalize";
import {
    placeNodeAt,
    orphanNode,
    deleteSubtree as treeDeleteSubtree,
    updateText,
    toggleStatus,
    toggleBold,
    setParent,
} from "@/lib/model/tree";
import { detectDrops } from "@/lib/model/drops";
import { createGroup, removeMemberOrDelete } from "@/lib/model/groups";
import { columnsForSheet } from "@/lib/grid/columns";
import {
    occupantAt,
    placeForSpawn,
    rippleDown,
    rippleUp,
    translateSubtree,
} from "@/lib/grid/coords";

// ─── State shape ──────────────────────────────────────────────────────────────

export interface RoundState {
    round: Round | null;
    past: Round[];
    future: Round[];
    /** Internal: identifies the last commit so consecutive same-key commits coalesce. */
    lastCommitKey: string | null;
    activeSheetId: string | null;
    /**
     * The focused cell as a grid coordinate. `nodeId` is no longer stored —
     * derived via `occupantAt` when needed.
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
    quickSwitcherOpen: boolean;
    settingsOpen: boolean;
    cheatsheetOpen: boolean;
    renamingSheetId: string | null;
    infoOpen: boolean;
    /**
     * Keyboard "grab & move": the id of the argument currently being moved, or
     * null. While set, the grid is in move mode — cells are not editable, the
     * selection acts as a target cursor, and the grabbed node shows dimmed.
     */
    moveSource: string | null;
    /** A node id to briefly flash (drop/move confirm), or null. Transient UI. */
    flashNodeId: string | null;
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

    addSheet(input: { title: string; group: "aff" | "neg" }): string;
    renameSheet(sheetId: string, title: string): void;
    /** Removes a sheet (and its nodes/groups), returning a payload for Undo. */
    removeSheet(sheetId: string): RemovedSheet | null;
    /** Re-inserts a previously removed sheet at its original position. */
    restoreSheet(removed: RemovedSheet): void;
    reorderSheet(sheetId: string, newOrder: number): void;
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
    setNodeParent(nodeId: string, parentId: string | null): void;

    placeBareNode(cell: { sheetId: string; speechId: string; row: number }, text?: string): string;
    spawnSibling(): string | null;
    spawnResponse(): string | null;
    insertRowAbove(): void;
    insertRowBelow(): void;
    deleteRow(): void;
    clearCell(): void;
    deleteSubtreeAt(): void;
    commitSubtreeMove(dCol: number, dRow: number): void;
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
    _commit(
        coalesceKey: string | null,
        producer: (round: Round) => Round,
    ): void;
    /** Internal: drop selection/activeSheet if they point at something now gone. */
    _reconcileAfterHistory(): void;

    setKeymapOverride(commandId: CommandId, chord: string): void;
    clearKeymapOverride(commandId: CommandId): void;
    setAutoNumber(v: boolean): void;
    setLabelDrops(v: boolean): void;
    setQuickSwitcherOpen(open: boolean): void;
    setSettingsOpen(open: boolean): void;
    setCheatsheetOpen(open: boolean): void;
    setRenamingSheet(id: string | null): void;
    setInfoOpen(open: boolean): void;
    setMoveSource(id: string | null): void;
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
        window.localStorage.setItem(
            KEYMAP_SETTINGS_KEY,
            JSON.stringify(settings),
        );
    } catch {
        // localStorage unavailable (private mode, quota) — ignore.
    }
}

// ─── Display settings persistence ───────────────────────────────────────────

const DISPLAY_SETTINGS_KEY = "df-display-settings";

interface DisplaySettings {
    autoNumber: boolean;
    labelDrops: boolean;
}

function loadDisplaySettings(): DisplaySettings {
    const fallback: DisplaySettings = {
        autoNumber: true,
        labelDrops: true,
    };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
        if (!raw) return fallback;
        const p = JSON.parse(raw) as Partial<DisplaySettings>;
        return {
            autoNumber: typeof p.autoNumber === "boolean" ? p.autoNumber : true,
            labelDrops: typeof p.labelDrops === "boolean" ? p.labelDrops : true,
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

// ─── Store ────────────────────────────────────────────────────────────────────

const UNDO_DEPTH = 50;

const initialKeymapSettings = loadKeymapSettings();

export const useRoundStore = create<RoundStore>((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────────
    round: null,
    past: [],
    future: [],
    lastCommitKey: null,
    activeSheetId: null,
    selection: null,
    keymapOverrides: initialKeymapSettings.keymapOverrides,
    autoNumber: initialDisplaySettings.autoNumber,
    labelDrops: initialDisplaySettings.labelDrops,
    quickSwitcherOpen: false,
    settingsOpen: false,
    cheatsheetOpen: false,
    renamingSheetId: null,
    infoOpen: false,
    moveSource: null,
    flashNodeId: null,

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
            past: [],
            future: [],
            lastCommitKey: null,
            activeSheetId: null,
            selection: null,
            quickSwitcherOpen: false,
            settingsOpen: false,
            cheatsheetOpen: false,
            renamingSheetId: null,
            infoOpen: false,
            moveSource: null,
            flashNodeId: null,
        });
    },

    // ── addSheet ───────────────────────────────────────────────────────────────
    addSheet({ title, group }) {
        const { round, activeSheetId } = get();
        if (!round) throw new Error("No active round");

        const maxOrder =
            round.sheets.length > 0
                ? Math.max(...round.sheets.map((s) => s.order))
                : -1;

        const firstNeg = round.format.speeches.find(
            (s) => s.side === "neg",
        )?.id;
        const sheet: Sheet = {
            id: uid("sheet"),
            title,
            group,
            order: maxOrder + 1,
            kind: "flow",
            startSpeechId:
                group === "neg" ? firstNeg : round.format.speeches[0]?.id,
        };

        const isFirstFlow =
            round.sheets.filter((s) => s.kind !== "cx").length === 0;
        get()._commit(null, (r) => ({ ...r, sheets: [...r.sheets, sheet] }));
        if (isFirstFlow) set({ activeSheetId: sheet.id });

        return sheet.id;
    },

    // ── renameSheet ────────────────────────────────────────────────────────────
    renameSheet(sheetId, title) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            sheets: r.sheets.map((s) =>
                s.id === sheetId ? { ...s, title } : s,
            ),
        }));
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

        const remaining = round.sheets.filter((s) => s.id !== sheetId);
        get()._commit(null, (r) => ({
            ...r,
            sheets: remaining,
            nodes: r.nodes.filter((n) => n.sheetId !== sheetId),
            groups: r.groups.filter((g) => g.sheetId !== sheetId),
        }));
        if (wasActive) {
            const nextActive =
                remaining.find((s) => s.kind !== "cx") ?? remaining[0] ?? null;
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
        get()._commit(null, (r) => ({
            ...r,
            sheets: [...r.sheets, removed.sheet],
            nodes: [...r.nodes, ...removed.nodes],
            groups: [...r.groups, ...removed.groups],
        }));
        if (removed.wasActive) set({ activeSheetId: removed.sheet.id });
    },

    // ── reorderSheet ───────────────────────────────────────────────────────────
    /**
     * Assigns a raw `order` value to the sheet. Callers are responsible for
     * avoiding collisions — e.g. pass fractional or pre-spaced order values.
     */
    reorderSheet(sheetId, newOrder) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            sheets: r.sheets.map((s) =>
                s.id === sheetId ? { ...s, order: newOrder } : s,
            ),
        }));
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
        get()._commit(null, (r) => ({ ...r, nodes }));
        return node.id;
    },

    // ── updateNodeText ─────────────────────────────────────────────────────────
    updateNodeText(nodeId, text) {
        if (!get().round) return;
        get()._commit(`text:${nodeId}`, (r) => ({
            ...r,
            nodes: updateText(r.nodes, nodeId, text),
        }));
    },

    // ── toggleNodeStatus ───────────────────────────────────────────────────────
    toggleNodeStatus(nodeId, status) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: toggleStatus(r.nodes, nodeId, status),
        }));
    },

    // ── toggleNodeBold ─────────────────────────────────────────────────────────
    toggleNodeBold(nodeId) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: toggleBold(r.nodes, nodeId),
        }));
    },

    // ── setNodeParent ──────────────────────────────────────────────────────────
    setNodeParent(nodeId, parentId) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: setParent(r.nodes, nodeId, parentId),
        }));
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
        get()._commit(null, (r) => ({ ...r, nodes }));
        return node.id;
    },

    spawnSibling() {
        const { round, selection } = get();
        if (!round || !selection) return null;
        const cur = occupantAt(
            round.nodes,
            selection.sheetId,
            selection.speechId,
            selection.row,
        );
        if (!cur) return null;
        const sheet = round.sheets.find((s) => s.id === selection.sheetId);
        if (!sheet) return null;
        const speeches = columnsForSheet(round.format, sheet);
        const placed = placeForSpawn(
            round.nodes,
            selection.sheetId,
            speeches,
            cur,
            "sibling",
        );
        if (!placed) return null;
        const { nodes, node } = placeNodeAt(placed.nodes, {
            sheetId: selection.sheetId,
            speechId: placed.speechId,
            parentId: cur.parentId,
            row: placed.row,
        });
        get()._commit(null, (r) => ({ ...r, nodes }));
        set({
            selection: {
                sheetId: selection.sheetId,
                speechId: placed.speechId,
                row: placed.row,
            },
        });
        return node.id;
    },

    spawnResponse() {
        const { round, selection } = get();
        if (!round || !selection) return null;
        const cur = occupantAt(
            round.nodes,
            selection.sheetId,
            selection.speechId,
            selection.row,
        );
        if (!cur) return null;
        const sheet = round.sheets.find((s) => s.id === selection.sheetId);
        if (!sheet) return null;
        const speeches = columnsForSheet(round.format, sheet);
        const placed = placeForSpawn(
            round.nodes,
            selection.sheetId,
            speeches,
            cur,
            "response",
        );
        if (!placed) return null;
        const { nodes, node } = placeNodeAt(placed.nodes, {
            sheetId: selection.sheetId,
            speechId: placed.speechId,
            parentId: cur.id,
            row: placed.row,
        });
        get()._commit(null, (r) => ({ ...r, nodes }));
        set({
            selection: {
                sheetId: selection.sheetId,
                speechId: placed.speechId,
                row: placed.row,
            },
        });
        return node.id;
    },

    insertRowAbove() {
        const { round, selection } = get();
        if (!round || !selection) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: rippleDown(r.nodes, selection.sheetId, selection.row, 1),
        }));
    },

    insertRowBelow() {
        const { round, selection } = get();
        if (!round || !selection) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: rippleDown(r.nodes, selection.sheetId, selection.row + 1, 1),
        }));
    },

    deleteRow() {
        const { round, selection } = get();
        if (!round || !selection) return;
        get()._commit(null, (r) => {
            const kept = r.nodes.filter(
                (n) =>
                    !(n.sheetId === selection.sheetId && n.row === selection.row),
            );
            return {
                ...r,
                nodes: rippleUp(kept, selection.sheetId, selection.row + 1, 1),
            };
        });
    },

    clearCell() {
        const { round, selection } = get();
        if (!round || !selection) return;
        const cur = occupantAt(
            round.nodes,
            selection.sheetId,
            selection.speechId,
            selection.row,
        );
        if (!cur) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: orphanNode(r.nodes, cur.id),
            groups: removeMemberOrDelete(r.groups, cur.id),
        }));
    },

    deleteSubtreeAt() {
        const { round, selection } = get();
        if (!round || !selection) return;
        const cur = occupantAt(
            round.nodes,
            selection.sheetId,
            selection.speechId,
            selection.row,
        );
        if (!cur) return;
        get()._commit(null, (r) => ({
            ...r,
            nodes: treeDeleteSubtree(r.nodes, cur.id),
        }));
    },

    commitSubtreeMove(dCol, dRow) {
        const { round, selection, moveSource } = get();
        if (!round || !selection || !moveSource) return;
        const sheet = round.sheets.find((s) => s.id === selection.sheetId);
        if (!sheet) return;
        const speeches = columnsForSheet(round.format, sheet);
        const { nodes, ok } = translateSubtree(
            round.nodes,
            speeches,
            moveSource,
            dCol,
            dRow,
        );
        if (!ok) return;
        get()._commit(null, (r) => ({ ...r, nodes }));
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
        get()._commit(null, (r) => ({
            ...r,
            nodes: r.nodes.map((n) =>
                n.id === nodeId ? { ...n, speechId, row } : n,
            ),
        }));
    },

    // ── groupNodes ─────────────────────────────────────────────────────────────
    groupNodes(sheetId, nodeIds, label) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            groups: createGroup(r.groups, {
                sheetId,
                memberIds: nodeIds,
                label,
            }),
        }));
    },

    // ── ungroupNode ────────────────────────────────────────────────────────────
    ungroupNode(nodeId) {
        if (!get().round) return;
        get()._commit(null, (r) => ({
            ...r,
            groups: removeMemberOrDelete(r.groups, nodeId),
        }));
    },

    // ── setSelection ───────────────────────────────────────────────────────────
    setSelection(selection) {
        set({ selection, lastCommitKey: null });
    },

    // ── undo/redo plumbing ───────────────────────────────────────────────────────
    // commit(coalesceKey, producer): snapshot current round, then replace it.
    // When coalesceKey matches the previous commit's key, the snapshot is reused
    // (the prior edits collapse into one undo step).
    _commit(coalesceKey, producer) {
        const { round, past, lastCommitKey } = get();
        if (!round) return;
        const next = producer(round);
        const coalesce = coalesceKey !== null && coalesceKey === lastCommitKey;
        const newPast = coalesce ? past : [...past, round].slice(-UNDO_DEPTH);
        set({
            round: { ...next, updatedAt: Date.now() },
            past: newPast,
            future: [],
            lastCommitKey: coalesceKey,
        });
    },

    undo() {
        const { past, future, round } = get();
        if (past.length === 0 || !round) return;
        const previous = past[past.length - 1];
        set({
            round: previous,
            past: past.slice(0, -1),
            future: [round, ...future].slice(0, UNDO_DEPTH),
            lastCommitKey: null,
        });
        get()._reconcileAfterHistory();
    },

    redo() {
        const { past, future, round } = get();
        if (future.length === 0 || !round) return;
        const next = future[0];
        set({
            round: next,
            past: [...past, round].slice(-UNDO_DEPTH),
            future: future.slice(1),
            lastCommitKey: null,
        });
        get()._reconcileAfterHistory();
    },

    // After undo/redo, drop selection/activeSheet if they now point at something gone.
    _reconcileAfterHistory() {
        const { round, activeSheetId, selection } = get();
        if (!round) return;
        const sheetExists = (id: string | null) =>
            !!id && round.sheets.some((s) => s.id === id);
        const nextActive = sheetExists(activeSheetId)
            ? activeSheetId
            : (round.sheets.find((s) => s.kind !== "cx")?.id ??
              round.sheets[0]?.id ??
              null);
        const selValid =
            selection &&
            round.sheets.some((s) => s.id === selection.sheetId);
        set({
            activeSheetId: nextActive,
            selection: selValid ? selection : null,
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
        });
    },

    // ── setLabelDrops ──────────────────────────────────────────────────────────
    setLabelDrops(v) {
        set({ labelDrops: v });
        saveDisplaySettings({
            autoNumber: get().autoNumber,
            labelDrops: v,
        });
    },

    // ── setQuickSwitcherOpen ───────────────────────────────────────────────────
    setQuickSwitcherOpen(open) {
        set({ quickSwitcherOpen: open });
    },

    // ── setSettingsOpen ────────────────────────────────────────────────────────
    setSettingsOpen(open) {
        set({ settingsOpen: open });
    },

    // ── setCheatsheetOpen ──────────────────────────────────────────────────────
    setCheatsheetOpen(open) {
        set({ cheatsheetOpen: open });
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
        get()._commit("scouting", (r) => ({
            ...r,
            scouting: { ...r.scouting, ...patch },
        }));
    },
}));

// ─── Pure selector helpers ────────────────────────────────────────────────────

/** Returns all nodes belonging to the given sheet, or [] if round is null. */
export function selectSheetNodes(
    round: Round | null,
    sheetId: string,
): ArgumentNode[] {
    if (!round) return [];
    return round.nodes.filter((n) => n.sheetId === sheetId);
}

/** Returns ids of dropped nodes on the given sheet, or [] if round is null. */
export function selectDrops(round: Round | null, sheetId: string): string[] {
    if (!round) return [];
    return detectDrops(round.nodes, round.format, sheetId);
}

/** Returns the count of dropped nodes on the given sheet, or 0 if round is null. */
export function selectSheetDropCount(
    round: Round | null,
    sheetId: string,
): number {
    return selectDrops(round, sheetId).length;
}

/** Returns sheets belonging to a group, sorted ascending by order. */
export function selectSheetsByGroup(
    round: Round | null,
    group: "aff" | "neg",
): Sheet[] {
    if (!round) return [];
    return round.sheets
        .filter((s) => s.group === group)
        .sort((a, b) => a.order - b.order);
}
