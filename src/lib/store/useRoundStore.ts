/**
 * Zustand store for the active debate round.
 *
 * State is kept immutable — every action returns new objects/arrays so that
 * Zustand's shallow equality can detect changes reliably.
 */

import { create } from 'zustand';
import type { CommandId } from '@/lib/commands/registry';
import type { Round, Sheet, ArgumentNode, Format, Role, Side, RoundMeta, NodeStatus } from '@/lib/model/types';
import { uid } from '@/lib/model/ids';
import { emptyScouting, emptyCx, makeCxSheet } from '@/lib/model/normalize';
import {
  addNode as treeAddNode,
  updateText,
  toggleStatus,
  setParent,
  removeNode as treeRemoveNode,
  moveNode as treeMoveNode,
} from '@/lib/model/tree';
import { detectDrops } from '@/lib/model/drops';

// ─── State shape ──────────────────────────────────────────────────────────────

export interface RoundState {
  round: Round | null;
  past: Round[];
  future: Round[];
  /** Internal: identifies the last commit so consecutive same-key commits coalesce. */
  lastCommitKey: string | null;
  activeSheetId: string | null;
  mode: 'normal' | 'insert';
  selection: { sheetId: string; speechId: string; nodeId: string } | null;
  keymapName: 'default' | 'vim';
  /** CommandId → custom chord (normal mode), overriding the preset binding. */
  keymapOverrides: Record<string, string>;
  autoNumber: boolean;
  labelDrops: boolean;
  quickSwitcherOpen: boolean;
  settingsOpen: boolean;
  cheatsheetOpen: boolean;
  renamingSheetId: string | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export interface RoundActions {
  createRound(input: { role: Role; format: Format; meta: RoundMeta }): void;

  addSheet(input: { title: string; group: 'aff' | 'neg' }): string;
  renameSheet(sheetId: string, title: string): void;
  removeSheet(sheetId: string): void;
  reorderSheet(sheetId: string, newOrder: number): void;
  setActiveSheet(sheetId: string): void;

  addNode(input: { sheetId: string; speechId: string; parentId: string | null; text?: string; insertAfterOrder?: number }): string;
  updateNodeText(nodeId: string, text: string): void;
  toggleNodeStatus(nodeId: string, status: NodeStatus): void;
  setNodeParent(nodeId: string, parentId: string | null): void;
  removeNode(nodeId: string): void;
  moveNode(nodeId: string, newOrder: number): void;

  setMode(mode: 'normal' | 'insert'): void;
  setSelection(selection: { sheetId: string; speechId: string; nodeId: string } | null): void;

  undo(): void;
  redo(): void;
  /** @internal `_commit` and `_reconcileAfterHistory` are store-private plumbing — do not call them outside the store's own action implementations. */
  /** Internal: snapshot the current round, then replace it via `producer`. */
  _commit(coalesceKey: string | null, producer: (round: Round) => Round): void;
  /** Internal: drop selection/activeSheet if they point at something now gone. */
  _reconcileAfterHistory(): void;

  setKeymapName(name: 'default' | 'vim'): void;
  setKeymapOverride(commandId: CommandId, chord: string): void;
  clearKeymapOverride(commandId: CommandId): void;
  setAutoNumber(v: boolean): void;
  setLabelDrops(v: boolean): void;
  setQuickSwitcherOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setCheatsheetOpen(open: boolean): void;
  setRenamingSheet(id: string | null): void;

  startSpeech(speechId: string): void;
  tickSpeech(): void;
  startPrep(side: Side): void;
  stopPrep(): void;
  tickPrep(): void;
}

export type RoundStore = RoundState & RoundActions;

// ─── Keymap settings persistence ────────────────────────────────────────────

const KEYMAP_SETTINGS_KEY = 'df-keymap-settings';

interface KeymapSettings {
  keymapName: 'default' | 'vim';
  keymapOverrides: Record<string, string>;
}

/** Loads persisted keymap settings from localStorage (SSR-safe). */
function loadKeymapSettings(): KeymapSettings {
  const fallback: KeymapSettings = { keymapName: 'default', keymapOverrides: {} };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(KEYMAP_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<KeymapSettings>;
    const validPresets = ['default', 'vim'] as const;
    const keymapName = validPresets.includes(parsed.keymapName as typeof validPresets[number])
      ? (parsed.keymapName as typeof validPresets[number])
      : fallback.keymapName;
    return {
      keymapName,
      keymapOverrides: parsed.keymapOverrides ?? fallback.keymapOverrides,
    };
  } catch {
    return fallback;
  }
}

/** Persists keymap settings to localStorage (SSR-safe; failures ignored). */
function saveKeymapSettings(settings: KeymapSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEYMAP_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode, quota) — ignore.
  }
}

// ─── Display settings persistence ───────────────────────────────────────────

const DISPLAY_SETTINGS_KEY = 'df-display-settings';

interface DisplaySettings { autoNumber: boolean; labelDrops: boolean }

function loadDisplaySettings(): DisplaySettings {
  const fallback: DisplaySettings = { autoNumber: true, labelDrops: true };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      autoNumber: typeof p.autoNumber === 'boolean' ? p.autoNumber : true,
      labelDrops: typeof p.labelDrops === 'boolean' ? p.labelDrops : true,
    };
  } catch { return fallback; }
}

function saveDisplaySettings(s: DisplaySettings): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
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
  mode: 'normal',
  selection: null,
  keymapName: initialKeymapSettings.keymapName,
  keymapOverrides: initialKeymapSettings.keymapOverrides,
  autoNumber: initialDisplaySettings.autoNumber,
  labelDrops: initialDisplaySettings.labelDrops,
  quickSwitcherOpen: false,
  settingsOpen: false,
  cheatsheetOpen: false,
  renamingSheetId: null,

  // ── createRound ────────────────────────────────────────────────────────────
  createRound({ role, format, meta }) {
    const now = Date.now();
    const round: Round = {
      id: uid('round'),
      createdAt: now,
      updatedAt: now,
      role,
      format,
      meta,
      scouting: emptyScouting(),
      sheets: [makeCxSheet()],
      nodes: [],
      cx: emptyCx(),
      timers: {
        activeSpeechId: null,
        speechRemaining: null,
        running: false,
        prepRemaining: {
          aff: format.prepSeconds.aff,
          neg: format.prepSeconds.neg,
        },
        prepRunning: null,
      },
    };
    set({
      round,
      past: [],
      future: [],
      lastCommitKey: null,
      activeSheetId: null,
      mode: 'normal',
      selection: null,
      quickSwitcherOpen: false,
      settingsOpen: false,
      cheatsheetOpen: false,
      renamingSheetId: null,
    });
  },

  // ── addSheet ───────────────────────────────────────────────────────────────
  addSheet({ title, group }) {
    const { round, activeSheetId } = get();
    if (!round) throw new Error('No active round');

    const maxOrder =
      round.sheets.length > 0
        ? Math.max(...round.sheets.map(s => s.order))
        : -1;

    const sheet: Sheet = {
      id: uid('sheet'),
      title,
      group,
      order: maxOrder + 1,
    };

    const isFirstFlow = round.sheets.filter(s => s.kind !== 'cx').length === 0;
    get()._commit(null, r => ({ ...r, sheets: [...r.sheets, sheet] }));
    if (isFirstFlow) set({ activeSheetId: sheet.id });

    return sheet.id;
  },

  // ── renameSheet ────────────────────────────────────────────────────────────
  renameSheet(sheetId, title) {
    if (!get().round) return;
    get()._commit(null, r => ({
      ...r,
      sheets: r.sheets.map(s => (s.id === sheetId ? { ...s, title } : s)),
    }));
  },

  // ── removeSheet ────────────────────────────────────────────────────────────
  removeSheet(sheetId) {
    const { round, activeSheetId, selection } = get();
    if (!round) return;

    const remaining = round.sheets.filter(s => s.id !== sheetId);
    get()._commit(null, r => ({
      ...r,
      sheets: remaining,
      nodes: r.nodes.filter(n => n.sheetId !== sheetId),
    }));
    if (activeSheetId === sheetId) set({ activeSheetId: remaining[0]?.id ?? null });
    if (selection?.sheetId === sheetId) set({ selection: null });
  },

  // ── reorderSheet ───────────────────────────────────────────────────────────
  /**
   * Assigns a raw `order` value to the sheet. Callers are responsible for
   * avoiding collisions — e.g. pass fractional or pre-spaced order values.
   */
  reorderSheet(sheetId, newOrder) {
    if (!get().round) return;
    get()._commit(null, r => ({
      ...r,
      sheets: r.sheets.map(s => (s.id === sheetId ? { ...s, order: newOrder } : s)),
    }));
  },

  // ── setActiveSheet ─────────────────────────────────────────────────────────
  setActiveSheet(sheetId) {
    set({ activeSheetId: sheetId });
  },

  // ── addNode ────────────────────────────────────────────────────────────────
  addNode(input) {
    const { round } = get();
    if (!round) throw new Error('No active round');

    const { nodes, node } = treeAddNode(round.nodes, input);
    get()._commit(null, r => ({ ...r, nodes }));
    return node.id;
  },

  // ── updateNodeText ─────────────────────────────────────────────────────────
  updateNodeText(nodeId, text) {
    if (!get().round) return;
    get()._commit(`text:${nodeId}`, r => ({ ...r, nodes: updateText(r.nodes, nodeId, text) }));
  },

  // ── toggleNodeStatus ───────────────────────────────────────────────────────
  toggleNodeStatus(nodeId, status) {
    if (!get().round) return;
    get()._commit(null, r => ({ ...r, nodes: toggleStatus(r.nodes, nodeId, status) }));
  },

  // ── setNodeParent ──────────────────────────────────────────────────────────
  setNodeParent(nodeId, parentId) {
    if (!get().round) return;
    get()._commit(null, r => ({ ...r, nodes: setParent(r.nodes, nodeId, parentId) }));
  },

  // ── removeNode ─────────────────────────────────────────────────────────────
  removeNode(nodeId) {
    const { round, selection } = get();
    if (!round) return;
    get()._commit(null, r => ({ ...r, nodes: treeRemoveNode(r.nodes, nodeId) }));
    if (selection?.nodeId === nodeId) set({ selection: null });
  },

  // ── moveNode ───────────────────────────────────────────────────────────────
  moveNode(nodeId, newOrder) {
    if (!get().round) return;
    get()._commit(null, r => ({ ...r, nodes: treeMoveNode(r.nodes, nodeId, newOrder) }));
  },

  // ── setMode ────────────────────────────────────────────────────────────────
  setMode(mode) {
    set({ mode, lastCommitKey: null });
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
    set({ round: { ...next, updatedAt: Date.now() }, past: newPast, future: [], lastCommitKey: coalesceKey });
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
    const sheetExists = (id: string | null) => !!id && round.sheets.some(s => s.id === id);
    const nextActive = sheetExists(activeSheetId) ? activeSheetId : (round.sheets[0]?.id ?? null);
    const selValid = selection
      && round.sheets.some(s => s.id === selection.sheetId)
      && (selection.nodeId === '' || round.nodes.some(n => n.id === selection.nodeId));
    set({ activeSheetId: nextActive, selection: selValid ? selection : null });
  },

  // ── setKeymapName ──────────────────────────────────────────────────────────
  setKeymapName(name) {
    set({ keymapName: name });
    saveKeymapSettings({ keymapName: name, keymapOverrides: get().keymapOverrides });
  },

  // ── setKeymapOverride ──────────────────────────────────────────────────────
  setKeymapOverride(commandId, chord) {
    const overrides = { ...get().keymapOverrides, [commandId]: chord };
    set({ keymapOverrides: overrides });
    saveKeymapSettings({ keymapName: get().keymapName, keymapOverrides: overrides });
  },

  // ── clearKeymapOverride ────────────────────────────────────────────────────
  clearKeymapOverride(commandId) {
    const overrides = { ...get().keymapOverrides };
    delete overrides[commandId];
    set({ keymapOverrides: overrides });
    saveKeymapSettings({ keymapName: get().keymapName, keymapOverrides: overrides });
  },

  // ── setAutoNumber ──────────────────────────────────────────────────────────
  setAutoNumber(v) {
    set({ autoNumber: v });
    saveDisplaySettings({ autoNumber: v, labelDrops: get().labelDrops });
  },

  // ── setLabelDrops ──────────────────────────────────────────────────────────
  setLabelDrops(v) {
    set({ labelDrops: v });
    saveDisplaySettings({ autoNumber: get().autoNumber, labelDrops: v });
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

  // ── startSpeech ────────────────────────────────────────────────────────────
  startSpeech(speechId) {
    const { round } = get();
    if (!round) return;
    const speech = round.format.speeches.find(s => s.id === speechId);
    if (!speech) return;
    set({
      round: {
        ...round,
        timers: {
          ...round.timers,
          activeSpeechId: speechId,
          speechRemaining: speech.seconds,
          running: true,
        },
        updatedAt: Date.now(),
      },
    });
  },

  // ── tickSpeech ─────────────────────────────────────────────────────────────
  tickSpeech() {
    const { round } = get();
    if (!round) return;
    const { speechRemaining } = round.timers;
    if (speechRemaining === null) return;
    set({
      round: {
        ...round,
        timers: {
          ...round.timers,
          speechRemaining: Math.max(0, speechRemaining - 1),
        },
        updatedAt: Date.now(),
      },
    });
  },

  // ── startPrep ──────────────────────────────────────────────────────────────
  startPrep(side) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        timers: {
          ...round.timers,
          prepRunning: side,
        },
        updatedAt: Date.now(),
      },
    });
  },

  // ── stopPrep ───────────────────────────────────────────────────────────────
  stopPrep() {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        timers: {
          ...round.timers,
          prepRunning: null,
        },
        updatedAt: Date.now(),
      },
    });
  },

  // ── tickPrep ───────────────────────────────────────────────────────────────
  tickPrep() {
    const { round } = get();
    if (!round) return;
    const { prepRunning, prepRemaining } = round.timers;
    if (!prepRunning) return;
    set({
      round: {
        ...round,
        timers: {
          ...round.timers,
          prepRemaining: {
            ...prepRemaining,
            [prepRunning]: Math.max(0, prepRemaining[prepRunning] - 1),
          },
        },
        updatedAt: Date.now(),
      },
    });
  },
}));

// ─── Pure selector helpers ────────────────────────────────────────────────────

/** Returns all nodes belonging to the given sheet, or [] if round is null. */
export function selectSheetNodes(round: Round | null, sheetId: string): ArgumentNode[] {
  if (!round) return [];
  return round.nodes.filter(n => n.sheetId === sheetId);
}

/** Returns ids of dropped nodes on the given sheet, or [] if round is null. */
export function selectDrops(round: Round | null, sheetId: string): string[] {
  if (!round) return [];
  return detectDrops(round.nodes, round.format, sheetId);
}

/** Returns the count of dropped nodes on the given sheet, or 0 if round is null. */
export function selectSheetDropCount(round: Round | null, sheetId: string): number {
  return selectDrops(round, sheetId).length;
}

/** Returns sheets belonging to a group, sorted ascending by order. */
export function selectSheetsByGroup(
  round: Round | null,
  group: 'aff' | 'neg',
): Sheet[] {
  if (!round) return [];
  return round.sheets
    .filter(s => s.group === group)
    .sort((a, b) => a.order - b.order);
}
