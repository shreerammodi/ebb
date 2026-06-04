/**
 * Command handlers.
 *
 * `executeCommand` reads and writes `useRoundStore.getState()`. All handlers
 * silently no-op when the round or selection is missing so the keyboard layer
 * can fire commands unconditionally.
 */

import { useRoundStore } from "@/lib/store/useRoundStore";
import type { Sheet, ArgumentNode } from "@/lib/model/types";
import {
  parentOf,
  firstChildOf,
  nodeAboveInColumn,
  nodeBelowInColumn,
  nextOpposingSpeech,
} from "@/lib/grid/navigation";
import { responseColumnFor, CX_COLUMNS } from "@/lib/model/cxColumns";
import type { CommandId } from "./registry";

/** Sheets sorted ascending by order. */
function sortedSheets(sheets: Sheet[]): Sheet[] {
  return sheets.slice().sort((a, b) => a.order - b.order);
}

/** Returns true when the given sheet is a CX sheet. */
function isCxSheet(round: { sheets: { id: string; kind?: string }[] }, sheetId: string): boolean {
  return round.sheets.find((s) => s.id === sheetId)?.kind === "cx";
}

/** Selects a node by its ids and switches to insert mode. */
function selectNodeInsert(ids: { sheetId: string; speechId: string; nodeId: string }): void {
  const { setSelection, setMode } = useRoundStore.getState();
  setSelection(ids);
  setMode("insert");
}

/** Jumps to the Nth (1-indexed, order-sorted) flow sheet, no-op if out of range. */
function jumpToSheet(n: number): void {
  const { round, setActiveSheet } = useRoundStore.getState();
  if (!round) return;
  const sheets = sortedSheets(round.sheets.filter((s) => s.kind !== "cx"));
  const target = sheets[n - 1];
  if (target) setActiveSheet(target.id);
}

export function executeCommand(id: CommandId): void {
  const state = useRoundStore.getState();
  const { round } = state;

  switch (id) {
    // ── Navigation ───────────────────────────────────────────────────────────
    case "move.up":
    case "move.down":
    case "move.left":
    case "move.right": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      const node = round.nodes.find((n) => n.id === sel.nodeId);
      if (!node) return;

      let target: ArgumentNode | null = null;
      if (id === "move.up") target = nodeAboveInColumn(round.nodes, node);
      else if (id === "move.down") target = nodeBelowInColumn(round.nodes, node);
      else if (id === "move.left") target = parentOf(round.nodes, node.id);
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
    case "edit.enter": {
      if (!round) return;
      const sel = state.selection;
      if (!sel) return;
      if (sel.nodeId === "") {
        const newId = state.addNode({
          sheetId: sel.sheetId,
          speechId: sel.speechId,
          parentId: null,
        });
        state.setSelection({ sheetId: sel.sheetId, speechId: sel.speechId, nodeId: newId });
      }
      state.setMode("insert");
      return;
    }

    case "edit.exit": {
      state.setMode("normal");
      return;
    }

    case "edit.undo": {
      useRoundStore.getState().undo();
      return;
    }

    case "edit.redo": {
      useRoundStore.getState().redo();
      return;
    }

    // ── Node creation ────────────────────────────────────────────────────────
    case "node.addAnswer": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      const node = round.nodes.find((n) => n.id === sel.nodeId);
      if (!node) return;
      const newId = state.addNode({
        sheetId: node.sheetId,
        speechId: node.speechId,
        parentId: node.parentId,
        insertAfterOrder: node.order,
      });
      selectNodeInsert({ sheetId: node.sheetId, speechId: node.speechId, nodeId: newId });
      return;
    }

    case "node.answerAcross": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      const node = round.nodes.find((n) => n.id === sel.nodeId);
      if (!node) return;
      let targetSpeechId: string | null;
      if (isCxSheet(round, node.sheetId)) {
        targetSpeechId = responseColumnFor(node.speechId); // Q → its Response column
      } else {
        targetSpeechId = nextOpposingSpeech(round.format, node.speechId)?.id ?? null;
      }
      if (!targetSpeechId) return;
      const newId = state.addNode({
        sheetId: node.sheetId,
        speechId: targetSpeechId,
        parentId: node.id,
      });
      selectNodeInsert({ sheetId: node.sheetId, speechId: targetSpeechId, nodeId: newId });
      return;
    }

    case "arg.newRoot": {
      if (!round) return;
      const sel = state.selection;
      const sheetId = sel?.sheetId ?? state.activeSheetId;
      if (!sheetId) return;
      const onCx = isCxSheet(round, sheetId);
      const speechId = sel?.speechId ?? (onCx ? CX_COLUMNS[0].id : round.format.speeches[0]?.id);
      if (!speechId) return;
      const selNode = sel?.nodeId ? round.nodes.find((n) => n.id === sel.nodeId) : undefined;
      const insertAfterOrder = selNode?.speechId === speechId ? selNode.order : undefined;
      const newId = state.addNode({ sheetId, speechId, parentId: null, insertAfterOrder });
      selectNodeInsert({ sheetId, speechId, nodeId: newId });
      return;
    }

    case "node.delete": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      const node = round.nodes.find((n) => n.id === sel.nodeId);
      if (!node) return;
      // Pick a neighbor so the cursor stays in the flow after deletion.
      // above/below/parent are never descendants of `node`, so they survive removal.
      const neighbor =
        nodeAboveInColumn(round.nodes, node) ??
        nodeBelowInColumn(round.nodes, node) ??
        parentOf(round.nodes, node.id);
      state.removeNode(sel.nodeId);
      if (neighbor) {
        state.setSelection({
          sheetId: neighbor.sheetId,
          speechId: neighbor.speechId,
          nodeId: neighbor.id,
        });
      } else {
        // No neighbor — keep the cursor on the now-empty cell in the same column.
        state.setSelection({ sheetId: node.sheetId, speechId: node.speechId, nodeId: "" });
      }
      return;
    }

    // ── Status ───────────────────────────────────────────────────────────────
    case "status.toggleConceded":
    case "status.toggleExtended": {
      if (!round) return;
      const sel = state.selection;
      if (!sel || sel.nodeId === "") return;
      if (isCxSheet(round, sel.sheetId)) return;
      state.toggleNodeStatus(sel.nodeId, id === "status.toggleConceded" ? "conceded" : "extended");
      return;
    }

    // ── Sheets ───────────────────────────────────────────────────────────────
    case "sheet.next":
    case "sheet.prev": {
      if (!round) return;
      const sheets = sortedSheets(round.sheets.filter((s) => s.kind !== "cx"));
      if (sheets.length === 0) return;
      const idx = sheets.findIndex((s) => s.id === state.activeSheetId);
      const base = idx === -1 ? 0 : idx;
      const next =
        id === "sheet.next" ? Math.min(base + 1, sheets.length - 1) : Math.max(base - 1, 0);
      state.setActiveSheet(sheets[next].id);
      return;
    }

    case "sheet.newAff": {
      if (!round) return;
      const newSheetId = state.addSheet({ title: "Untitled", group: "aff" });
      state.setActiveSheet(newSheetId);
      // Selection not pre-set for aff (by design) — newNeg sets selection because
      // the user lands on an empty neg sheet and needs a column focused to start typing.
      return;
    }

    case "sheet.newNeg": {
      if (!round) return;
      const newSheetId = state.addSheet({ title: "Untitled", group: "neg" });
      state.setActiveSheet(newSheetId);
      const firstNegSpeech = round.format.speeches.find((s) => s.side === "neg");
      if (firstNegSpeech) {
        state.setSelection({ sheetId: newSheetId, speechId: firstNegSpeech.id, nodeId: "" });
      }
      return;
    }

    case "sheet.rename": {
      const { activeSheetId } = state;
      if (!activeSheetId) return;
      state.setRenamingSheet(activeSheetId);
      return;
    }

    case "sheet.quickSwitch": {
      state.setQuickSwitcherOpen(true);
      return;
    }

    case "sheet.jump1":
    case "sheet.jump2":
    case "sheet.jump3":
    case "sheet.jump4":
    case "sheet.jump5":
    case "sheet.jump6":
    case "sheet.jump7":
    case "sheet.jump8":
    case "sheet.jump9": {
      if (!round) return;
      const n = Number(id.slice("sheet.jump".length));
      jumpToSheet(n);
      return;
    }

    // ── Settings ─────────────────────────────────────────────────────────────
    case "settings.open": {
      state.setSettingsOpen(true);
      return;
    }

    // ── Info ──────────────────────────────────────────────────────────────────
    case "info.open": {
      state.setInfoOpen(true);
      return;
    }

    // ── Help ─────────────────────────────────────────────────────────────────
    case "help.open": {
      state.setCheatsheetOpen(!state.cheatsheetOpen);
      return;
    }

    // ── Timers ────────────────────────────────────────────────────────────────
    case "timer.toggleSpeech": {
      if (!round) return;
      if (round.timers.running) {
        useRoundStore.setState({
          round: {
            ...round,
            timers: { ...round.timers, running: false },
          },
        });
      } else if (round.timers.activeSpeechId !== null) {
        useRoundStore.setState({
          round: {
            ...round,
            timers: { ...round.timers, running: true },
          },
        });
      }
      return;
    }

    case "timer.togglePrepAff": {
      if (!round) return;
      if (round.timers.prepRunning === "aff") {
        state.stopPrep();
      } else {
        state.startPrep("aff");
      }
      return;
    }

    case "timer.togglePrepNeg": {
      if (!round) return;
      if (round.timers.prepRunning === "neg") {
        state.stopPrep();
      } else {
        state.startPrep("neg");
      }
      return;
    }
  }
}
