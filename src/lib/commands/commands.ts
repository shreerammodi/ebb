/**
 * Command handlers for the fully modeless grid editor.
 *
 * `executeCommand` reads and writes `useRoundStore.getState()`. All handlers
 * silently no-op when the round or selection is missing so the keyboard layer
 * can fire commands unconditionally.
 */

import { useRoundStore } from "@/lib/store/useRoundStore";
import type { Sheet, Round } from "@/lib/model/types";
import { columnsForSheet } from "@/lib/grid/columns";
import type { CommandId } from "./registry";

/** Sheets sorted ascending by order. */
function sortedSheets(sheets: Sheet[]): Sheet[] {
    return sheets.slice().sort((a, b) => a.order - b.order);
}

/** Jumps to the Nth (1-indexed, order-sorted) flow sheet, no-op if out of range. */
function jumpToSheet(n: number): void {
    const { round, setActiveSheet } = useRoundStore.getState();
    if (!round) return;
    const sheets = sortedSheets(round.sheets.filter((s) => s.kind !== "cx"));
    const target = sheets[n - 1];
    if (target) setActiveSheet(target.id);
}

/** Column stepping helper. */
function columnStep(state: { selection: { sheetId: string; speechId: string; row: number } | null; round: Round | null }, dir: "up" | "down" | "left" | "right"): void {
    const { round, selection } = state;
    if (!round || !selection) return;
    const sheet = round.sheets.find((s) => s.id === selection.sheetId);
    if (!sheet) return;
    const speeches = columnsForSheet(round.format, sheet);
    const colIdx = speeches.findIndex((s) => s.id === selection.speechId);
    if (colIdx === -1) return;

    let nCol = colIdx;
    let nRow = selection.row;

    if (dir === "up") nRow = Math.max(0, selection.row - 1);
    else if (dir === "down") nRow = selection.row + 1;
    else if (dir === "left") nCol = Math.max(0, colIdx - 1);
    else nCol = Math.min(speeches.length - 1, colIdx + 1);

    state.setSelection({
        sheetId: selection.sheetId,
        speechId: speeches[nCol].id,
        row: nRow,
    });
}

export function executeCommand(id: CommandId): void {
    const state = useRoundStore.getState();
    const { round } = state;

    switch (id) {
        // ── Navigation (coordinate stepping) ──────────────────────────────────
        case "move.up":
            columnStep(state, "up");
            return;
        case "move.down":
            columnStep(state, "down");
            return;
        case "move.left":
            columnStep(state, "left");
            return;
        case "move.right":
            columnStep(state, "right");
            return;

        // ── Node creation ─────────────────────────────────────────────────────
        case "node.sibling": {
            const id = state.spawnSibling();
            if (id) {
                // Selection already moved by spawnSibling; editor takes over.
            }
            return;
        }
        case "node.response": {
            state.spawnResponse();
            return;
        }

        // ── Row operations ────────────────────────────────────────────────────
        case "row.insertAbove":
            state.insertRowAbove();
            return;
        case "row.insertBelow":
            state.insertRowBelow();
            return;
        case "row.delete":
            state.deleteRow();
            return;

        // ── Cell operations ───────────────────────────────────────────────────
        case "cell.clear":
            state.clearCell();
            return;
        case "node.deleteSubtree":
            state.deleteSubtreeAt();
            return;

        // ── Edit ──────────────────────────────────────────────────────────────
        case "edit.undo":
            useRoundStore.getState().undo();
            return;
        case "edit.redo":
            useRoundStore.getState().redo();
            return;

        // ── Status / format ───────────────────────────────────────────────────
        case "status.toggleConceded":
        case "status.toggleExtended":
        case "format.toggleBold": {
            if (!round) return;
            const sel = state.selection;
            if (!sel) return;
            // Find the occupant node at the selected coordinate.
            const node = round.nodes.find(
                (n) =>
                    n.sheetId === sel.sheetId &&
                    n.speechId === sel.speechId &&
                    n.row === sel.row,
            );
            if (!node) return;
            if (id === "format.toggleBold") {
                state.toggleNodeBold(node.id);
            } else {
                state.toggleNodeStatus(
                    node.id,
                    id === "status.toggleConceded" ? "conceded" : "extended",
                );
            }
            return;
        }

        // ── Sheets ────────────────────────────────────────────────────────────
        case "sheet.next":
        case "sheet.prev": {
            if (!round) return;
            const sheets = sortedSheets(
                round.sheets.filter((s) => s.kind !== "cx"),
            );
            if (sheets.length === 0) return;
            const idx = sheets.findIndex((s) => s.id === state.activeSheetId);
            const base = idx === -1 ? 0 : idx;
            const next =
                id === "sheet.next"
                    ? Math.min(base + 1, sheets.length - 1)
                    : Math.max(base - 1, 0);
            state.setActiveSheet(sheets[next].id);
            return;
        }
        case "sheet.newAff": {
            if (!round) return;
            const newSheetId = state.addSheet({
                title: "Untitled",
                group: "aff",
            });
            state.setActiveSheet(newSheetId);
            return;
        }
        case "sheet.newNeg": {
            if (!round) return;
            const newSheetId = state.addSheet({
                title: "Untitled",
                group: "neg",
            });
            state.setActiveSheet(newSheetId);
            const firstNegSpeech = round.format.speeches.find(
                (s) => s.side === "neg",
            );
            if (firstNegSpeech) {
                state.setSelection({
                    sheetId: newSheetId,
                    speechId: firstNegSpeech.id,
                    row: 0,
                });
            }
            return;
        }
        case "sheet.rename": {
            const { activeSheetId } = state;
            if (!activeSheetId) return;
            state.setRenamingSheet(activeSheetId);
            return;
        }
        case "sheet.quickSwitch":
            state.setQuickSwitcherOpen(true);
            return;
        case "sheet.jump1":
        case "sheet.jump2":
        case "sheet.jump3":
        case "sheet.jump4":
        case "sheet.jump5":
        case "sheet.jump6":
        case "sheet.jump7":
        case "sheet.jump8":
        case "sheet.jump9": {
            const n = Number(id.slice("sheet.jump".length));
            jumpToSheet(n);
            return;
        }

        // ── Settings ──────────────────────────────────────────────────────────
        case "settings.open":
            state.setSettingsOpen(true);
            return;
        case "info.open":
            state.setInfoOpen(true);
            return;
        case "help.open":
            state.setCheatsheetOpen(!state.cheatsheetOpen);
            return;

        // ── Keyboard grab & move ──────────────────────────────────────────────
        case "move.grab": {
            if (!round) return;
            const sel = state.selection;
            if (!sel) return;
            const node = round.nodes.find(
                (n) =>
                    n.sheetId === sel.sheetId &&
                    n.speechId === sel.speechId &&
                    n.row === sel.row,
            );
            if (!node) return;
            state.setMoveSource(node.id);
            return;
        }
        case "move.cancel": {
            const src = state.moveSource;
            state.setMoveSource(null);
            if (src && round) {
                const node = round.nodes.find((n) => n.id === src);
                if (node) {
                    state.setSelection({
                        sheetId: node.sheetId,
                        speechId: node.speechId,
                        row: node.row,
                    });
                }
            }
            return;
        }
        case "move.commit": {
            const src = state.moveSource;
            const sel = state.selection;
            if (!round || !src || !sel) {
                state.setMoveSource(null);
                return;
            }
            const srcNode = round.nodes.find((n) => n.id === src);
            if (!srcNode) {
                state.setMoveSource(null);
                return;
            }
            const dCol =
                columnsForSheet(
                    round.format,
                    round.sheets.find((s) => s.id === sel.sheetId)!,
                ).findIndex((s) => s.id === sel.speechId) -
                columnsForSheet(
                    round.format,
                    round.sheets.find((s) => s.id === srcNode.sheetId)!,
                ).findIndex((s) => s.id === srcNode.speechId);
            const dRow = sel.row - srcNode.row;
            state.commitSubtreeMove(dCol, dRow);
            state.setMoveSource(null);
            // Re-read after commit
            const moved = useRoundStore
                .getState()
                .round?.nodes.find((n) => n.id === src);
            if (moved) {
                state.setSelection({
                    sheetId: moved.sheetId,
                    speechId: moved.speechId,
                    row: moved.row,
                });
            }
            state.setFlashNode(src);
            return;
        }

        // ── Column navigation ─────────────────────────────────────────────────
        case "nav.nextSpeech":
        case "nav.prevSpeech": {
            if (!round) return;
            const sel = state.selection;
            if (!sel) return;
            const sheet = round.sheets.find((s) => s.id === sel.sheetId);
            if (!sheet) return;
            const speeches = columnsForSheet(round.format, sheet);
            const currentIdx = speeches.findIndex((s) => s.id === sel.speechId);
            if (currentIdx === -1) return;
            const targetIdx =
                id === "nav.nextSpeech" ? currentIdx + 1 : currentIdx - 1;
            if (targetIdx < 0 || targetIdx >= speeches.length) return;
            state.setSelection({
                sheetId: sel.sheetId,
                speechId: speeches[targetIdx].id,
                row: sel.row,
            });
            return;
        }
    }
}
