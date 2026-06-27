"use client";

/**
 * FlowGrid — coordinate-based spreadsheet grid for a single sheet.
 *
 * Renders a <table class="flow"> where each (speechId, row) is a distinct cell.
 * Position is stored on ArgumentNode as (speechId, row). There is no rowspan
 * and no tree-derived layout. Empty cells are always first-class selection
 * targets. Relationships (parent/child) are shown via selection-time highlight.
 */

import { useState, useMemo } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { detectDrops } from "@/lib/model/drops";
import GridCell from "./GridCell";
import EmptyCellEditor from "./EmptyCellEditor";
import { columnsForSheet } from "@/lib/grid/columns";
import { occupantAt, maxRow, subtreeMaxRow } from "@/lib/grid/coords";

const TRAILING_BUFFER_ROWS = 8;

export interface FlowGridProps {
  sheetId: string;
}

export default function FlowGrid({ sheetId }: FlowGridProps) {
  const structuralKey = useRoundStore(
    (s) => {
      const filtered = (s.round?.nodes ?? []).filter((n) => n.sheetId === sheetId);
      return filtered
        .map((n) => `${n.id}:${n.speechId}:${n.row}:${n.parentId}:${n.bold}:${n.statuses.join(",")}`)
        .join("|");
    }
  );

  const sheetNodes = useMemo(() => {
    const _ = structuralKey;
    const allNodes = useRoundStore.getState().round?.nodes ?? [];
    return allNodes.filter((n) => n.sheetId === sheetId);
  }, [structuralKey, sheetId]);

  const format = useRoundStore((s) => s.round?.format ?? null);
  const selection = useRoundStore((s) => s.selection);
  const setSelection = useRoundStore((s) => s.setSelection);
  const moveSource = useRoundStore((s) => s.moveSource);
  const flashNodeId = useRoundStore((s) => s.flashNodeId);
  const setFlashNode = useRoundStore((s) => s.setFlashNode);
  const sheets = useRoundStore((s) => s.round?.sheets ?? []);

  const droppedIdsKey = useRoundStore(
    (s) => {
      const ids = detectDrops(s.round?.nodes ?? [], s.round?.format ?? null, sheetId);
      return ids.join(",");
    }
  );

  const droppedIds = useMemo(() => {
    return new Set(droppedIdsKey ? droppedIdsKey.split(",") : []);
  }, [droppedIdsKey]);

  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const sheet = sheets.find((s) => s.id === sheetId);
  if (!format || !sheet) return null;

  const speeches = columnsForSheet(format, sheet);

  // ── Compute group header info ──────────────────────────────────────────────
  interface TopCell {
    label: string;
    span: number;
    side: "aff" | "neg" | null;
  }
  const topCells: TopCell[] = [];
  let hasGroups = false;
  {
    let i = 0;
    while (i < speeches.length) {
      const g = speeches[i].group;
      if (g) {
        let j = i;
        while (j < speeches.length && speeches[j].group === g) j++;
        topCells.push({
          label: g,
          span: j - i,
          side: speeches[i].side,
        });
        i = j;
        hasGroups = true;
      } else {
        topCells.push({ label: "", span: 1, side: null });
        i++;
      }
    }
  }

  // ── Determine effective row count ──────────────────────────────────────────
  const topRow = maxRow(sheetNodes, sheetId);
  const effectiveRows = Math.max(topRow + 1 + TRAILING_BUFFER_ROWS, TRAILING_BUFFER_ROWS);

  // ── Children lookup for relationship highlight ────────────────────────────
  const childrenByParent = new Map<string, string[]>();
  for (const node of sheetNodes) {
    if (node.parentId === null) continue;
    const arr = childrenByParent.get(node.parentId);
    if (arr) arr.push(node.id);
    else childrenByParent.set(node.parentId, [node.id]);
  }

  // Selection's occupant for relationship highlight
  const selNode = selection
    ? occupantAt(sheetNodes, selection.sheetId, selection.speechId, selection.row)
    : null;
  const selChildren = selNode ? new Set(childrenByParent.get(selNode.id) ?? []) : new Set<string>();

  // Build a position lookup for child nodes so we can detect adjacency and
  // draw a continuous outline box instead of per-cell inset borders.
  // Key: `${speechId}:${row}` → true when that cell holds a selected child.
  const selChildPositions = new Set<string>();
  if (selNode) {
    for (const node of sheetNodes) {
      if (selChildren.has(node.id)) {
        selChildPositions.add(`${node.speechId}:${node.row}`);
      }
    }
  }

  const sheetIsEmpty = sheetNodes.length === 0;

  // ── Reserved cells ────────────────────────────────────────────────────────
  // Empty cells inside an argument's response band: the parent-column rows
  // beside its responses. They are greyed and inert so a new argument can't be
  // interleaved into the middle of an exchange — siblings land below the band.
  const reservedKeys = new Set<string>();
  for (const p of sheetNodes) {
    const end = subtreeMaxRow(sheetNodes, p.id);
    for (let r = p.row + 1; r <= end; r++) {
      if (!occupantAt(sheetNodes, sheetId, p.speechId, r)) {
        reservedKeys.add(`${r},${p.speechId}`);
      }
    }
  }

  return (
    <>
      {moveSource !== null && (
        <div className="move-banner" role="status" aria-live="polite">
          <span className="move-banner-tag">Move</span>
          <span>
            Arrows to choose a target, <kbd>Enter</kbd> to drop, <kbd>Esc</kbd> to cancel
          </span>
        </div>
      )}
      <table className="flow" onDragEnd={() => setDragOverKey(null)}>
        <caption className="flow-caption">
          {sheet.title} sheet. Columns are speeches; each row holds an argument and its responses.
        </caption>
        <thead>
          {hasGroups && (
            <tr>
              {topCells.map((cell, idx) =>
                cell.label ? (
                  <th
                    key={idx}
                    scope="colgroup"
                    colSpan={cell.span}
                    className={cell.side === "aff" ? "side-aff" : "side-neg"}
                  >
                    {cell.label}
                  </th>
                ) : (
                  <th key={idx} />
                ),
              )}
            </tr>
          )}
          <tr>
            {speeches.map((speech) => (
              <th
                key={speech.id}
                scope="col"
                className={speech.side === "aff" ? "side-aff" : "side-neg"}
              >
                <span className="th-label">{speech.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: effectiveRows }, (_, row) => (
            <tr key={row}>
              {speeches.map((speech) => {
                const node = occupantAt(sheetNodes, sheetId, speech.id, row);
                const isSel =
                  selection?.sheetId === sheetId &&
                  selection?.speechId === speech.id &&
                  selection?.row === row;
                const sideClass = speech.side === "aff" ? "side-aff" : "side-neg";

                if (node) {
                  const isDropped = droppedIds.has(node.id);
                  const isFlash = flashNodeId === node.id;
                  const isSource = moveSource === node.id;
                  const isMoveCursor = moveSource !== null && isSel && !isSource;
                  const relClass = selNode
                    ? node.id === selNode.parentId
                      ? "cell-rel-parent"
                      : selChildren.has(node.id)
                        ? (() => {
                            const aboveKey = `${node.speechId}:${node.row - 1}`;
                            const belowKey = `${node.speechId}:${node.row + 1}`;
                            const hasAbove = selChildPositions.has(aboveKey);
                            const hasBelow = selChildPositions.has(belowKey);
                            if (!hasAbove && !hasBelow) return "cell-rel-child-only";
                            if (!hasAbove) return "cell-rel-child-top";
                            if (!hasBelow) return "cell-rel-child-bot";
                            return "cell-rel-child-mid";
                          })()
                        : ""
                    : "";
                  const classes = [
                    sideClass,
                    isDropped ? "cell-drop" : "",
                    isSource ? "cell-moving" : "",
                    isSel && moveSource === null ? "cell-sel" : "",
                    isMoveCursor ? "drag-over" : "",
                    isFlash ? "cell-flash" : "",
                    relClass,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <td
                      key={speech.id}
                      className={classes}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverKey(`${row},${speech.id}`);
                      }}
                      onAnimationEnd={isFlash ? () => setFlashNode(null) : undefined}
                    >
                      <GridCell
                        node={node}
                        sheetId={sheetId}
                        speechId={speech.id}
                        isDropped={isDropped}
                        sheetNodes={sheetNodes}
                        hasChildren={childrenByParent.has(node.id)}
                      />
                    </td>
                  );
                }

                // Empty cell
                const cellKey = `${row},${speech.id}`;
                // Reserved: greyed and inert (beside another arg's
                // responses). Not selectable, not a drop target.
                const reserved = reservedKeys.has(cellKey);
                const isSelected = isSel && !reserved;
                const showHint = sheetIsEmpty && row === 0 && speech.id === speeches[0].id;
                const isMoveCursor = moveSource !== null && isSelected;
                const isDragOver = dragOverKey === cellKey;
                const classes = [
                  sideClass,
                  reserved ? "cell-reserved" : "cell-open",
                  isSelected && moveSource === null ? "cell-sel" : "",
                  isMoveCursor || isDragOver ? "drag-over" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <td
                    key={speech.id}
                    className={classes}
                    aria-disabled={reserved || undefined}
                    onClick={
                      reserved
                        ? undefined
                        : () =>
                            setSelection({
                              sheetId,
                              speechId: speech.id,
                              row,
                            })
                    }
                    onDragOver={
                      reserved
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            setDragOverKey(cellKey);
                          }
                    }
                    onDrop={
                      reserved
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            const dragged = e.dataTransfer.getData("text/df-node");
                            if (dragged) {
                              // Single-cell drag: move the node here.
                              useRoundStore.getState().moveCellTo(dragged, speech.id, row);
                              setFlashNode(dragged);
                            }
                            setDragOverKey(null);
                          }
                    }
                  >
                    {isSelected && moveSource === null ? (
                      <EmptyCellEditor sheetId={sheetId} speechId={speech.id} />
                    ) : showHint ? (
                      <span className="cell-hint">Type to add your first argument</span>
                    ) : (
                      <span className="cell-empty" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
