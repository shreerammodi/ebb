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
  activeSheetId: string | null;
  mode: 'normal' | 'insert';
  selection: { sheetId: string; speechId: string; nodeId: string } | null;
  keymapName: 'default' | 'vim';
  /** CommandId → custom chord (normal mode), overriding the preset binding. */
  keymapOverrides: Record<string, string>;
  quickSwitcherOpen: boolean;
  settingsOpen: boolean;
  cheatsheetOpen: boolean;
  renamingSheetId: string | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export interface RoundActions {
  createRound(input: { role: Role; format: Format; meta: RoundMeta; topic?: string }): void;

  addSheet(input: { title: string; group: 'aff' | 'neg' }): string;
  renameSheet(sheetId: string, title: string): void;
  removeSheet(sheetId: string): void;
  reorderSheet(sheetId: string, newOrder: number): void;
  setActiveSheet(sheetId: string): void;

  addNode(input: { sheetId: string; speechId: string; parentId: string | null; text?: string }): string;
  updateNodeText(nodeId: string, text: string): void;
  toggleNodeStatus(nodeId: string, status: NodeStatus): void;
  setNodeParent(nodeId: string, parentId: string | null): void;
  removeNode(nodeId: string): void;
  moveNode(nodeId: string, newOrder: number): void;

  setMode(mode: 'normal' | 'insert'): void;
  setSelection(selection: { sheetId: string; speechId: string; nodeId: string } | null): void;

  setKeymapName(name: 'default' | 'vim'): void;
  setKeymapOverride(commandId: CommandId, chord: string): void;
  clearKeymapOverride(commandId: CommandId): void;
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

// ─── Store ────────────────────────────────────────────────────────────────────

const initialKeymapSettings = loadKeymapSettings();

export const useRoundStore = create<RoundStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  round: null,
  activeSheetId: null,
  mode: 'normal',
  selection: null,
  keymapName: initialKeymapSettings.keymapName,
  keymapOverrides: initialKeymapSettings.keymapOverrides,
  quickSwitcherOpen: false,
  settingsOpen: false,
  cheatsheetOpen: false,
  renamingSheetId: null,

  // ── createRound ────────────────────────────────────────────────────────────
  createRound({ role, format, meta, topic }) {
    const now = Date.now();
    const round: Round = {
      id: uid('round'),
      createdAt: now,
      updatedAt: now,
      role,
      format,
      topic,
      meta,
      sheets: [],
      nodes: [],
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

    const isFirst = round.sheets.length === 0;
    set({
      round: {
        ...round,
        sheets: [...round.sheets, sheet],
        updatedAt: Date.now(),
      },
      activeSheetId: isFirst ? sheet.id : activeSheetId,
    });

    return sheet.id;
  },

  // ── renameSheet ────────────────────────────────────────────────────────────
  renameSheet(sheetId, title) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        sheets: round.sheets.map(s => (s.id === sheetId ? { ...s, title } : s)),
        updatedAt: Date.now(),
      },
    });
  },

  // ── removeSheet ────────────────────────────────────────────────────────────
  removeSheet(sheetId) {
    const { round, activeSheetId, selection } = get();
    if (!round) return;

    const remaining = round.sheets.filter(s => s.id !== sheetId);
    const nodes = round.nodes.filter(n => n.sheetId !== sheetId);

    let newActiveSheetId = activeSheetId;
    if (activeSheetId === sheetId) {
      newActiveSheetId = remaining.length > 0 ? remaining[0].id : null;
    }

    set({
      round: {
        ...round,
        sheets: remaining,
        nodes,
        updatedAt: Date.now(),
      },
      activeSheetId: newActiveSheetId,
      selection: selection?.sheetId === sheetId ? null : selection,
    });
  },

  // ── reorderSheet ───────────────────────────────────────────────────────────
  /**
   * Assigns a raw `order` value to the sheet. Callers are responsible for
   * avoiding collisions — e.g. pass fractional or pre-spaced order values.
   */
  reorderSheet(sheetId, newOrder) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        sheets: round.sheets.map(s =>
          s.id === sheetId ? { ...s, order: newOrder } : s,
        ),
        updatedAt: Date.now(),
      },
    });
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
    set({
      round: {
        ...round,
        nodes,
        updatedAt: Date.now(),
      },
    });
    return node.id;
  },

  // ── updateNodeText ─────────────────────────────────────────────────────────
  updateNodeText(nodeId, text) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        nodes: updateText(round.nodes, nodeId, text),
        updatedAt: Date.now(),
      },
    });
  },

  // ── toggleNodeStatus ───────────────────────────────────────────────────────
  toggleNodeStatus(nodeId, status) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        nodes: toggleStatus(round.nodes, nodeId, status),
        updatedAt: Date.now(),
      },
    });
  },

  // ── setNodeParent ──────────────────────────────────────────────────────────
  setNodeParent(nodeId, parentId) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        nodes: setParent(round.nodes, nodeId, parentId),
        updatedAt: Date.now(),
      },
    });
  },

  // ── removeNode ─────────────────────────────────────────────────────────────
  removeNode(nodeId) {
    const { round, selection } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        nodes: treeRemoveNode(round.nodes, nodeId),
        updatedAt: Date.now(),
      },
      selection: selection?.nodeId === nodeId ? null : selection,
    });
  },

  // ── moveNode ───────────────────────────────────────────────────────────────
  moveNode(nodeId, newOrder) {
    const { round } = get();
    if (!round) return;
    set({
      round: {
        ...round,
        nodes: treeMoveNode(round.nodes, nodeId, newOrder),
        updatedAt: Date.now(),
      },
    });
  },

  // ── setMode ────────────────────────────────────────────────────────────────
  setMode(mode) {
    set({ mode });
  },

  // ── setSelection ───────────────────────────────────────────────────────────
  setSelection(selection) {
    set({ selection });
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
