/**
 * Zustand store for the active debate round.
 *
 * State is kept immutable — every action returns new objects/arrays so that
 * Zustand's shallow equality can detect changes reliably.
 */

import { create } from 'zustand';
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
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export interface RoundActions {
  createRound(input: { role: Role; format: Format; meta: RoundMeta; topic?: string }): void;

  addSheet(input: { title: string; group: 'case' | 'offcase' }): string;
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
}

export type RoundStore = RoundState & RoundActions;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRoundStore = create<RoundStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  round: null,
  activeSheetId: null,
  mode: 'normal',
  selection: null,

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
    set({ round, activeSheetId: null, mode: 'normal', selection: null });
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
  group: 'case' | 'offcase',
): Sheet[] {
  if (!round) return [];
  return round.sheets
    .filter(s => s.group === group)
    .sort((a, b) => a.order - b.order);
}
