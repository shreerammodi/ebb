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

import { columnsForSheet } from "@/lib/grid/columns";
import { occupantAt, maxRow, descendantIds } from "@/lib/grid/coords";
import { detectDrops } from "@/lib/model/drops";
import type { Sheet } from "@/lib/model/types";
import {
    isUnitHead,
    lastMemberRow,
    unitBandBottom,
    unitHeadOf,
    unitKeyOf,
    unitSubtreeIds,
} from "@/lib/model/units";
import { useRoundStore } from "@/lib/store/useRoundStore";

import EmptyCellEditor from "./EmptyCellEditor";
import GridCell from "./GridCell";

const TRAILING_BUFFER_ROWS = 8;
const EMPTY_SHEETS: Sheet[] = [];

export interface FlowGridProps {
    sheetId: string;
}

export default function FlowGrid({ sheetId }: FlowGridProps) {
    const structuralKey = useRoundStore((s) => {
        const filtered = (s.round?.nodes ?? []).filter((n) => n.sheetId === sheetId);
        return filtered
            .map(
                (n) =>
                    `${n.id}:${n.speechId}:${n.row}:${n.parentId}:${n.bold}:${n.text}:${n.statuses.join(",")}:${n.unitId ?? ""}`,
            )
            .join("|");
    });

    const sheetNodes = useMemo(() => {
        const _ = structuralKey;
        const allNodes = useRoundStore.getState().round?.nodes ?? [];
        return allNodes.filter((n) => n.sheetId === sheetId);
    }, [structuralKey, sheetId]);

    const format = useRoundStore((s) => s.round?.format ?? null);
    const selection = useRoundStore((s) => s.selection);
    const setSelection = useRoundStore((s) => s.setSelection);
    const moveSource = useRoundStore((s) => s.moveSource);
    const linkSource = useRoundStore((s) => s.linkSource);
    const pendingSpawn = useRoundStore((s) => s.pendingSpawn);
    const flashNodeId = useRoundStore((s) => s.flashNodeId);
    const setFlashNode = useRoundStore((s) => s.setFlashNode);
    const sheets = useRoundStore((s) => s.round?.sheets ?? EMPTY_SHEETS);

    const droppedIdsKey = useRoundStore((s) => {
        if (!s.round) return "";
        const ids = detectDrops(s.round.nodes, s.round.format, sheetId);
        return ids.join(",");
    });

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

    // ── Unit divider tiers ────────────────────────────────────────────────────
    // Within a unit: no rule (cells read as one argument). Between units: the
    // normal light gridline. Heavy rule: only where a boundary touches a unit
    // whose response band extends past its own cells - untouched transcription
    // reads as a clean list, and rules materialize exactly where clash exists.
    const colIndexOf = new Map(speeches.map((s, i) => [s.id, i]));
    const heads = sheetNodes.filter((n) => isUnitHead(sheetNodes, n));
    const siblingsByParent = new Map<string | null, typeof sheetNodes>();
    for (const h of heads) {
        const arr = siblingsByParent.get(h.parentId);
        if (arr) arr.push(h);
        else siblingsByParent.set(h.parentId, [h]);
    }
    const isTall = (h: (typeof sheetNodes)[number]) =>
        unitBandBottom(sheetNodes, h) > lastMemberRow(sheetNodes, h);
    // row → leftmost column index at which a band boundary begins
    const bandStartByRow = new Map<number, number>();
    for (const group of siblingsByParent.values()) {
        if (group.length < 2) continue;
        const sorted = [...group].sort((a, b) => a.row - b.row);
        for (let i = 1; i < sorted.length; i++) {
            const n = sorted[i];
            if (!isTall(n) && !isTall(sorted[i - 1])) continue;
            const col = colIndexOf.get(n.speechId);
            if (col === undefined) continue;
            const prev = bandStartByRow.get(n.row);
            bandStartByRow.set(n.row, prev === undefined ? col : Math.min(prev, col));
        }
    }

    // Cells whose upstairs neighbour is the same unit - their top rule vanishes.
    const unitContKeys = new Set<string>();
    for (const n of sheetNodes) {
        const above = occupantAt(sheetNodes, sheetId, n.speechId, n.row - 1);
        if (above && unitKeyOf(above) === unitKeyOf(n)) {
            unitContKeys.add(`${n.speechId}:${n.row}`);
        }
    }

    // Selection's occupant for relationship highlight. Relationships route through
    // the unit HEAD so a continuation cell lights the parent box and co-members.
    const selNode = selection
        ? occupantAt(sheetNodes, selection.sheetId, selection.speechId, selection.row)
        : null;
    const selHead = selNode ? unitHeadOf(sheetNodes, selNode) : null;
    const selChildren = selHead
        ? new Set(childrenByParent.get(selHead.id) ?? [])
        : new Set<string>();
    const selUnitKey = selNode ? unitKeyOf(selNode) : null;

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
        const end = unitBandBottom(sheetNodes, p);
        for (let r = p.row + 1; r <= end; r++) {
            if (!occupantAt(sheetNodes, sheetId, p.speechId, r)) {
                reservedKeys.add(`${r},${p.speechId}`);
            }
        }
    }

    // Any grab (move or link) puts the grid in a target-cursor mode.
    const grabActive = moveSource !== null || linkSource !== null;

    // All cells that travel with the current grab (move: subtree; link: unit band)
    const movingSubtree =
        moveSource !== null
            ? descendantIds(sheetNodes, moveSource)
            : linkSource !== null
              ? unitSubtreeIds(sheetNodes, linkSource)
              : new Set<string>();

    return (
        <>
            {moveSource !== null && (
                <div className="move-banner" role="status" aria-live="polite">
                    <span className="move-banner-tag">Move</span>
                    <span>
                        Arrows to choose a target, <kbd>Enter</kbd> to drop, <kbd>Esc</kbd> to
                        cancel
                    </span>
                </div>
            )}
            {linkSource !== null && (
                <div className="move-banner" role="status" aria-live="polite">
                    <span className="move-banner-tag">Link</span>
                    <span>
                        Arrows to choose the argument this answers, <kbd>Enter</kbd> to link,{" "}
                        <kbd>Esc</kbd> to cancel
                    </span>
                </div>
            )}
            <table className="flow" onDragEnd={() => setDragOverKey(null)}>
                <caption className="flow-caption">
                    {sheet.title} sheet. Columns are speeches; each row holds an argument and its
                    responses.
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
                            {speeches.map((speech, colIdx) => {
                                const node = occupantAt(sheetNodes, sheetId, speech.id, row);
                                const isSel =
                                    selection?.sheetId === sheetId &&
                                    selection?.speechId === speech.id &&
                                    selection?.row === row;
                                const sideClass = speech.side === "aff" ? "side-aff" : "side-neg";
                                const bandStartCol = bandStartByRow.get(row);
                                const bandClass =
                                    bandStartCol !== undefined && colIdx >= bandStartCol
                                        ? "cell-band-start"
                                        : "";

                                // A deferred spawn whose parent is this node should
                                // also trigger the parent highlight, even though the
                                // selection is on the (still-empty) target cell — without
                                // this, the purple parent box flashes off during the
                                // armed-and-typing interval.
                                const isPendingParent =
                                    node !== null &&
                                    pendingSpawn !== null &&
                                    pendingSpawn.sheetId === sheetId &&
                                    pendingSpawn.parentId === node.id;
                                if (node) {
                                    const isDropped = droppedIds.has(node.id);
                                    const isFlash = flashNodeId === node.id;
                                    const isSource =
                                        moveSource === node.id || linkSource === node.id;
                                    const isMoving = movingSubtree.has(node.id);
                                    const isMoveCursor = grabActive && isSel && !isSource;
                                    const relClass = isPendingParent
                                        ? "cell-rel-parent"
                                        : selNode
                                          ? node.id === selHead?.parentId
                                              ? "cell-rel-parent"
                                              : selChildren.has(node.id)
                                                ? (() => {
                                                      const aboveKey = `${node.speechId}:${node.row - 1}`;
                                                      const belowKey = `${node.speechId}:${node.row + 1}`;
                                                      const hasAbove =
                                                          selChildPositions.has(aboveKey);
                                                      const hasBelow =
                                                          selChildPositions.has(belowKey);
                                                      if (!hasAbove && !hasBelow)
                                                          return "cell-rel-child-only";
                                                      if (!hasAbove) return "cell-rel-child-top";
                                                      if (!hasBelow) return "cell-rel-child-bot";
                                                      return "cell-rel-child-mid";
                                                  })()
                                                : ""
                                          : "";
                                    const classes = [
                                        sideClass,
                                        bandClass,
                                        isDropped ? "cell-drop" : "",
                                        isMoving ? "cell-moving" : "",
                                        isSel && !grabActive ? "cell-sel" : "",
                                        selUnitKey !== null &&
                                        unitKeyOf(node) === selUnitKey &&
                                        !isSel
                                            ? "cell-unit-sel"
                                            : "",
                                        unitContKeys.has(`${node.speechId}:${node.row}`)
                                            ? "cell-unit-cont"
                                            : "",
                                        isMoveCursor ? "drag-over" : "",
                                        isFlash
                                            ? `cell-flash${colIdx > 0 && colIdx <= 3 ? ` col-stagger-${colIdx}` : ""}`
                                            : "",
                                        node.statuses.includes("conceded") ? "cell-conceded" : "",
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
                                            onAnimationEnd={
                                                isFlash ? () => setFlashNode(null) : undefined
                                            }
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
                                // A deferred spawn targeting this cell always shows
                                // the editor, even if the cell is reserved (a response
                                // slot can land inside another argument's band).
                                const isPendingHere =
                                    pendingSpawn !== null &&
                                    pendingSpawn.sheetId === sheetId &&
                                    pendingSpawn.speechId === speech.id &&
                                    pendingSpawn.row === row;
                                const showHint =
                                    sheetIsEmpty && row === 0 && speech.id === speeches[0].id;
                                const isMoveCursor = grabActive && isSelected;
                                const isDragOver = dragOverKey === cellKey;
                                const classes = [
                                    sideClass,
                                    bandClass,
                                    reserved ? "cell-reserved" : "cell-open",
                                    isSelected && !grabActive ? "cell-sel" : "",
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
                                                      const dragged =
                                                          e.dataTransfer.getData("text/df-node");
                                                      if (dragged) {
                                                          const draggedNode = useRoundStore
                                                              .getState()
                                                              .round?.nodes.find(
                                                                  (n) => n.id === dragged,
                                                              );
                                                          if (draggedNode) {
                                                              const srcCol = speeches.findIndex(
                                                                  (s) =>
                                                                      s.id === draggedNode.speechId,
                                                              );
                                                              const dCol =
                                                                  colIdx -
                                                                  (srcCol >= 0 ? srcCol : 0);
                                                              const dRow = row - draggedNode.row;
                                                              const moved = useRoundStore
                                                                  .getState()
                                                                  .commitSubtreeMove(
                                                                      dCol,
                                                                      dRow,
                                                                      dragged,
                                                                  );
                                                              if (moved) {
                                                                  setFlashNode(dragged);
                                                              }
                                                          }
                                                      }
                                                      setDragOverKey(null);
                                                  }
                                        }
                                    >
                                        {(isSelected || isPendingHere) && !grabActive ? (
                                            <EmptyCellEditor
                                                sheetId={sheetId}
                                                speechId={speech.id}
                                            />
                                        ) : showHint ? (
                                            <span className="cell-hint">
                                                Type to add your first argument
                                            </span>
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
