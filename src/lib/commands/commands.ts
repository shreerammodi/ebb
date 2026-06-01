/**
 * Command handlers.
 *
 * `executeCommand` reads and writes `useRoundStore.getState()`. All handlers
 * silently no-op when the round or selection is missing so the keyboard layer
 * can fire commands unconditionally.
 */

import { useRoundStore } from '@/lib/store/useRoundStore';
import type { Sheet } from '@/lib/model/types';
import {
  parentOf,
  firstChildOf,
  nodeAboveInColumn,
  nodeBelowInColumn,
  nextOpposingSpeech,
} from '@/lib/grid/navigation';
import type { CommandId } from './registry';

/** Sheets sorted ascending by order. */
function sortedSheets(sheets: Sheet[]): Sheet[] {
  return sheets.slice().sort((a, b) => a.order - b.order);
}

/** Selects a node by its ids and switches to insert mode. */
function selectNodeInsert(ids: { sheetId: string; speechId: string; nodeId: string }): void {
  const { setSelection, setMode } = useRoundStore.getState();
  setSelection(ids);
  setMode('insert');
}

/** Jumps to the Nth (1-indexed, order-sorted) sheet, no-op if out of range. */
function jumpToSheet(n: number): void {
  const { round, setActiveSheet } = useRoundStore.getState();
  if (!round) return;
  const sheets = sortedSheets(round.sheets);
  const target = sheets[n - 1];
  if (target) setActiveSheet(target.id);
}

export function executeCommand(id: CommandId): void {
  const state = useRoundStore.getState();
  const { round } = state;

  switch (id) {
    // ── Navigation ───────────────────────────────────────────────────────────
    case 'move.up':
    case 'move.down':
    case 'move.left':
    case 'move.right': {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === '') return;
      const node = round.nodes.find(n => n.id === sel.nodeId);
      if (!node) return;

      let target: ArgumentNode | null = null;
      if (id === 'move.up') target = nodeAboveInColumn(round.nodes, node);
      else if (id === 'move.down') target = nodeBelowInColumn(round.nodes, node);
      else if (id === 'move.left') target = parentOf(round.nodes, node.id);
      else target = firstChildOf(round.nodes, node.id, node.sheetId);

      if (target) {
        state.setSelection({
          sheetId: target.sheetId,
          speechId: target.speechId,
          nodeId: target.id,
        });
      }
      return;
    }

    // ── Editing ──────────────────────────────────────────────────────────────
    case 'edit.enter': {
      if (!round) return;
      const sel = state.selection;
      if (!sel) return;
      if (sel.nodeId === '') {
        const newId = state.addNode({
          sheetId: sel.sheetId,
          speechId: sel.speechId,
          parentId: null,
        });
        state.setSelection({ sheetId: sel.sheetId, speechId: sel.speechId, nodeId: newId });
      }
      state.setMode('insert');
      return;
    }

    case 'edit.exit': {
      state.setMode('normal');
      return;
    }

    // ── Node creation ────────────────────────────────────────────────────────
    case 'node.addAnswer': {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === '') return;
      const node = round.nodes.find(n => n.id === sel.nodeId);
      if (!node) return;
      const newId = state.addNode({
        sheetId: node.sheetId,
        speechId: node.speechId,
        parentId: node.parentId,
      });
      selectNodeInsert({ sheetId: node.sheetId, speechId: node.speechId, nodeId: newId });
      return;
    }

    case 'node.answerAcross': {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === '') return;
      const node = round.nodes.find(n => n.id === sel.nodeId);
      if (!node) return;
      const targetSpeech = nextOpposingSpeech(round.format, node.speechId);
      if (!targetSpeech) return;
      const newId = state.addNode({
        sheetId: node.sheetId,
        speechId: targetSpeech.id,
        parentId: node.id,
      });
      selectNodeInsert({ sheetId: node.sheetId, speechId: targetSpeech.id, nodeId: newId });
      return;
    }

    case 'arg.newRoot': {
      if (!round) return;
      const sel = state.selection;
      const sheetId = sel?.sheetId ?? state.activeSheetId;
      if (!sheetId) return;
      const speechId = sel?.speechId ?? round.format.speeches[0]?.id;
      if (!speechId) return;
      const newId = state.addNode({ sheetId, speechId, parentId: null });
      selectNodeInsert({ sheetId, speechId, nodeId: newId });
      return;
    }

    case 'node.delete': {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === '') return;
      state.removeNode(sel.nodeId);
      return;
    }

    // ── Status ───────────────────────────────────────────────────────────────
    case 'status.toggleConceded':
    case 'status.toggleExtended': {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === '') return;
      state.toggleNodeStatus(
        sel.nodeId,
        id === 'status.toggleConceded' ? 'conceded' : 'extended',
      );
      return;
    }

    // ── Sheets ───────────────────────────────────────────────────────────────
    case 'sheet.next':
    case 'sheet.prev': {
      if (!round) return;
      const sheets = sortedSheets(round.sheets);
      if (sheets.length === 0) return;
      const idx = sheets.findIndex(s => s.id === state.activeSheetId);
      const base = idx === -1 ? 0 : idx;
      const next = id === 'sheet.next'
        ? Math.min(base + 1, sheets.length - 1)
        : Math.max(base - 1, 0);
      state.setActiveSheet(sheets[next].id);
      return;
    }

    case 'sheet.new': {
      if (!round) return;
      const newSheetId = state.addSheet({ title: 'Untitled', group: 'offcase' });
      state.setActiveSheet(newSheetId);
      return;
    }

    case 'sheet.quickSwitch': {
      state.setQuickSwitcherOpen(true);
      return;
    }

    case 'sheet.jump1':
    case 'sheet.jump2':
    case 'sheet.jump3':
    case 'sheet.jump4':
    case 'sheet.jump5':
    case 'sheet.jump6':
    case 'sheet.jump7':
    case 'sheet.jump8':
    case 'sheet.jump9': {
      if (!round) return;
      const n = Number(id.slice('sheet.jump'.length));
      jumpToSheet(n);
      return;
    }

    // ── Settings ─────────────────────────────────────────────────────────────
    case 'settings.open': {
      state.setSettingsOpen(true);
      return;
    }
  }
}
