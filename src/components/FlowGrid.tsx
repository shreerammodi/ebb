"use client";

/**
 * FlowGrid — elastic debate flow table for a single sheet.
 *
 * Renders a <table class="flow"> with:
 *   - (Optional) top header row for speech groups (e.g. "Neg block")
 *   - Bottom header row with speech names + side classes
 *   - Body rows computed by the tree → rowspan layout algorithm
 *
 * ASSUMPTION: responses always live in a LATER column than their parent
 * (debate-natural). Same-column parent/child relationships are not exercised
 * by tests and would collapse gracefully into separate rows.
 */

import { useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { detectDrops } from "@/lib/model/drops";
import { CX_COLUMNS } from "@/lib/model/cxColumns";
import GridCell from "./GridCell";
import EmptyCellEditor from "./EmptyCellEditor";
import { buildLayout, type PlacedNode } from "@/lib/grid/layout";
import { columnsForSheet } from "@/lib/grid/columns";
import { isValidMoveTarget } from "@/lib/grid/move";

// ─── FlowGrid component ───────────────────────────────────────────────────────

export interface FlowGridProps {
    sheetId: string;
}

export default function FlowGrid({ sheetId }: FlowGridProps) {
    // Narrow store subscriptions to avoid re-renders on timer ticks
    const nodes = useRoundStore((s) => s.round?.nodes ?? []);
    const format = useRoundStore((s) => s.round?.format ?? null);
    const selection = useRoundStore((s) => s.selection);
    const setSelection = useRoundStore((s) => s.setSelection);
    const addNode = useRoundStore((s) => s.addNode);
    const setMode = useRoundStore((s) => s.setMode);
    const straightDown = useRoundStore((s) => s.straightDown);
    const moveSource = useRoundStore((s) => s.moveSource);
    const flashNodeId = useRoundStore((s) => s.flashNodeId);
    const setFlashNode = useRoundStore((s) => s.setFlashNode);

    // Drag feedback: which cell is the current drop target. The confirm flash
    // (flashNodeId) lives in the store so mouse drop and keyboard move share it.
    const [dragOverKey, setDragOverKey] = useState<string | null>(null);

    const sheets = useRoundStore((s) => s.round?.sheets ?? []);
    const sheet = sheets.find((s) => s.id === sheetId);
    const isCx = sheet?.kind === "cx";

    if (!format) return null;

    const speeches = isCx
        ? CX_COLUMNS
        : sheet
          ? columnsForSheet(format, sheet)
          : format.speeches;

    const sheetNodes = nodes.filter((n) => n.sheetId === sheetId);
    const droppedIds =
        isCx || straightDown
            ? new Set<string>()
            : new Set(detectDrops(nodes, format, sheetId));

    // ── Compute group header info ──────────────────────────────────────────────
    // Build "top header" cells: runs of same non-empty group get a colSpan header;
    // ungrouped speeches each get an empty cell.
    interface TopCell {
        label: string;
        span: number;
        side: "aff" | "neg" | null;
    }
    const topCells: TopCell[] = [];
    let i = 0;
    let hasGroups = false;
    while (i < speeches.length) {
        const g = speeches[i].group;
        if (g) {
            // count consecutive speeches with the same group
            let j = i;
            while (j < speeches.length && speeches[j].group === g) j++;
            // derive side from the first speech in the group
            const side = speeches[i].side;
            topCells.push({ label: g, span: j - i, side });
            i = j;
            hasGroups = true;
        } else {
            topCells.push({ label: "", span: 1, side: null });
            i++;
        }
    }

    // ── Build layout ───────────────────────────────────────────────────────────
    const { placed, totalRows } = buildLayout(sheetNodes, speeches);

    // Build lookup: (row, col) → PlacedNode or 'covered' or undefined
    const cellMap = new Map<string, PlacedNode | "covered">();
    for (const p of placed) {
        cellMap.set(`${p.startRow},${p.col}`, p);
        for (let r = p.startRow + 1; r < p.startRow + p.rowSpan; r++) {
            cellMap.set(`${r},${p.col}`, "covered");
        }
    }

    // ── Active empty cell (Excel-style entry cell) ───────────────────────────────
    // When an empty cell (`nodeId: ""`) is focused, resolve which physical (row,
    // col) hosts its editor. An explicit `selection.row` wins; otherwise default
    // to the entry row — the first blank row at the bottom of that column.
    let activeEmptyCol: number | null = null;
    let activeEmptyRow: number | null = null;
    if (selection?.sheetId === sheetId && selection.nodeId === "") {
        const col = speeches.findIndex((s) => s.id === selection.speechId);
        if (col !== -1) {
            activeEmptyCol = col;
            activeEmptyRow =
                typeof selection.row === "number"
                    ? selection.row
                    : placed
                          .filter((p) => p.col === col)
                          .reduce(
                              (m, p) => Math.max(m, p.startRow + p.rowSpan),
                              0,
                          );
        }
    }

    // In straight-down mode the sheet reads like a spreadsheet: show one trailing
    // blank entry row below the content so there is always a cell to type into.
    const effectiveRows = Math.max(
        totalRows + (straightDown ? 1 : 0),
        (activeEmptyRow ?? -1) + 1,
        1,
    );

    // Children lookup (for arg-parent class)
    const hasChildrenSet = new Set<string>();
    for (const node of sheetNodes) {
        if (node.parentId !== null) hasChildrenSet.add(node.parentId);
    }

    // First-run onboarding: a brand-new sheet has no arguments yet. Show a single
    // quiet prompt in the entry cell (col 0, row 0) so a debater knows where to
    // start; it vanishes the moment they type. Never on CX sheets (fixed Q/R grid).
    const sheetIsEmpty = !isCx && sheetNodes.length === 0;

    return (
        <>
            {moveSource !== null && (
                <div className="move-banner" role="status" aria-live="polite">
                    <span className="move-banner-tag">Move</span>
                    <span>
                        Arrows to choose a target, <kbd>Enter</kbd> to drop,{" "}
                        <kbd>Esc</kbd> to cancel
                    </span>
                </div>
            )}
            <table className="flow" onDragEnd={() => setDragOverKey(null)}>
                <caption className="flow-caption">
                    {sheet?.title ?? "Flow"} sheet. Columns are speeches; each
                    row holds an argument and its responses.
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
                                        className={
                                            cell.side === "aff"
                                                ? "side-aff"
                                                : "side-neg"
                                        }
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
                                className={
                                    speech.side === "aff"
                                        ? "side-aff"
                                        : "side-neg"
                                }
                            >
                                <span className="th-label">{speech.name}</span>
                                {!isCx && (
                                    <button
                                        type="button"
                                        className="th-add"
                                        title={`New argument in ${speech.name}`}
                                        onClick={() => {
                                            const id = addNode({
                                                sheetId,
                                                speechId: speech.id,
                                                parentId: null,
                                            });
                                            setSelection({
                                                sheetId,
                                                speechId: speech.id,
                                                nodeId: id,
                                            });
                                            setMode("insert");
                                        }}
                                    >
                                        +
                                    </button>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: effectiveRows }, (_, row) => (
                        <tr key={row}>
                            {speeches.map((speech, col) => {
                                const entry = cellMap.get(`${row},${col}`);

                                if (entry === "covered") {
                                    // This cell is covered by a rowspan above — skip rendering it
                                    return null;
                                }

                                const sideClass =
                                    speech.side === "aff"
                                        ? "side-aff"
                                        : "side-neg";

                                if (entry) {
                                    // Render a node cell
                                    const { node, rowSpan } = entry;
                                    const isDropped = droppedIds.has(node.id);
                                    const isSelected =
                                        selection?.sheetId === sheetId &&
                                        selection?.speechId === speech.id &&
                                        selection?.nodeId === node.id;

                                    const cellKey = `${row},${col}`;
                                    const isFlash = flashNodeId === node.id;
                                    const isSource = moveSource === node.id;
                                    // In move mode the selected node cell is the target cursor.
                                    const isMoveCursor =
                                        moveSource !== null &&
                                        isSelected &&
                                        !isSource;
                                    const validTarget =
                                        isMoveCursor &&
                                        isValidMoveTarget(
                                            sheetNodes,
                                            speeches,
                                            moveSource!,
                                            {
                                                kind: "node",
                                                nodeId: node.id,
                                            },
                                        );
                                    const showDragOver =
                                        dragOverKey === cellKey ||
                                        (isMoveCursor && validTarget);
                                    // Solid cursor outline when selected outside move mode, or when the
                                    // move cursor sits on an invalid target (shows position, not a drop).
                                    const showSel =
                                        isSelected &&
                                        (moveSource === null ||
                                            (isMoveCursor && !validTarget));
                                    const classes = [
                                        sideClass,
                                        isDropped ? "cell-drop" : "",
                                        isSource ? "cell-moving" : "",
                                        showSel ? "cell-sel" : "",
                                        showDragOver ? "drag-over" : "",
                                        isFlash ? "cell-flash" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ");

                                    return (
                                        <td
                                            key={col}
                                            rowSpan={rowSpan}
                                            className={classes}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverKey(cellKey);
                                            }}
                                            onAnimationEnd={
                                                isFlash
                                                    ? () => setFlashNode(null)
                                                    : undefined
                                            }
                                        >
                                            <GridCell
                                                node={node}
                                                sheetId={sheetId}
                                                speechId={speech.id}
                                                isDropped={isDropped}
                                                sheetNodes={sheetNodes}
                                                hasChildren={hasChildrenSet.has(
                                                    node.id,
                                                )}
                                                isCx={isCx}
                                                onReparent={(draggedId) =>
                                                    setFlashNode(draggedId)
                                                }
                                            />
                                        </td>
                                    );
                                }

                                // Empty cell — clickable to start a new arg.
                                // A cell is "accessible" (keeps its gridlines) only where an
                                // argument can actually go: the first column, where roots
                                // originate, or a cell whose immediate left neighbour holds an
                                // argument to respond to. Everything else is unreachable — e.g.
                                // 1NC cells when there are no 1AC arguments — and renders blank.
                                // Straight-down mode drops this rule: every cell is real (like a
                                // spreadsheet), so there are no inaccessible voids.
                                const isAccessible =
                                    straightDown ||
                                    col === 0 ||
                                    cellMap.has(`${row},${col - 1}`);

                                // When a non-straight-down empty cell sits directly right of a
                                // node, the first keystroke should create a response (child) of
                                // that node rather than a new root. Rowspan-covered cells are
                                // resolved to the spanning node above them.
                                let responseParentId: string | null = null;
                                if (!straightDown && !isCx && col > 0) {
                                    const leftEntry = cellMap.get(`${row},${col - 1}`);
                                    if (leftEntry && leftEntry !== "covered") {
                                        responseParentId = leftEntry.node.id;
                                    } else if (leftEntry === "covered") {
                                        const spanning = placed.find(
                                            (p) =>
                                                p.col === col - 1 &&
                                                p.startRow <= row &&
                                                row < p.startRow + p.rowSpan,
                                        );
                                        if (spanning) responseParentId = spanning.node.id;
                                    }
                                }

                                const isSelected =
                                    activeEmptyCol === col &&
                                    activeEmptyRow === row;
                                const showHint =
                                    sheetIsEmpty && col === 0 && row === 0;
                                const cellKey = `${row},${col}`;
                                // In move mode an empty cell can be the target cursor (a rehome).
                                const isMoveCursor =
                                    moveSource !== null && isSelected;
                                const showDragOver =
                                    (isAccessible && dragOverKey === cellKey) ||
                                    isMoveCursor;

                                const classes = [
                                    sideClass,
                                    isAccessible ? "cell-open" : "cell-void",
                                    isSelected && moveSource === null
                                        ? "cell-sel"
                                        : "",
                                    showDragOver ? "drag-over" : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ");

                                return (
                                    <td
                                        key={col}
                                        className={classes}
                                        onClick={() =>
                                            setSelection({
                                                sheetId,
                                                speechId: speech.id,
                                                nodeId: "",
                                                row,
                                            })
                                        }
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            if (isAccessible)
                                                setDragOverKey(cellKey);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const dragged =
                                                e.dataTransfer.getData(
                                                    "text/df-node",
                                                );
                                            if (dragged) {
                                                useRoundStore
                                                    .getState()
                                                    .rehomeNode(
                                                        dragged,
                                                        speech.id,
                                                        null,
                                                    );
                                                setFlashNode(dragged);
                                            }
                                            setDragOverKey(null);
                                        }}
                                    >
                                        {isSelected && moveSource === null ? (
                                            <EmptyCellEditor
                                                sheetId={sheetId}
                                                speechId={speech.id}
                                                parentId={responseParentId}
                                            />
                                        ) : showHint ? (
                                            <span className="cell-hint">
                                                Type to add your first argument
                                            </span>
                                        ) : (
                                            // A blank spacer keeps the row height. Reachability is conveyed
                                            // by the cell's interactivity (cell-open vs cell-void), not a
                                            // glyph: an em-dash here reads as content (a real flow
                                            // annotation), so unreachable cells are just empty grid space.
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
