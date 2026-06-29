"use client";

/**
 * GridCell — renders a single argument node cell in the flow grid.
 *
 * Modeless: a cell enters edit mode when it is selected. The first printable
 * keystroke on an EMPTY cell is handled by EmptyCellEditor; here we just
 * render a textarea when selected.
 */

import { useRef, useEffect, useState } from "react";

import { executeCommand } from "@/lib/commands/commands";
import { columnsForSheet } from "@/lib/grid/columns";
import { numberFor } from "@/lib/model/numbering";
import type { ArgumentNode } from "@/lib/model/types";
import { isMacPlatform } from "@/lib/platform";
import { useRoundStore } from "@/lib/store/useRoundStore";

export interface GridCellProps {
    node: ArgumentNode;
    sheetId: string;
    speechId: string;
    isDropped: boolean;
    sheetNodes: ArgumentNode[];
    hasChildren: boolean;
}

export default function GridCell({
    node,
    sheetId,
    speechId,
    isDropped,
    sheetNodes,
    hasChildren,
}: GridCellProps) {
    const selection = useRoundStore((s) => s.selection);
    const setSelection = useRoundStore((s) => s.setSelection);
    const updateNodeText = useRoundStore((s) => s.updateNodeText);
    const autoNumber = useRoundStore((s) => s.autoNumber);
    const labelDrops = useRoundStore((s) => s.labelDrops);
    const moveActive = useRoundStore((s) => s.moveSource !== null);

    const [localText, setLocalText] = useState(node.text);

    useEffect(() => {
        setLocalText(node.text);
    }, [node.text]);

    const isSelected =
        selection?.sheetId === sheetId &&
        selection?.speechId === speechId &&
        selection?.row === node.row;

    const isEditing = !moveActive && isSelected;
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const autoHeight = () => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        if (isEditing && inputRef.current) {
            const el = inputRef.current;
            el.focus();
            const end = el.value.length;
            el.setSelectionRange(end, end);
            autoHeight();
        }
    }, [isEditing]);

    const handleClick = () => {
        setSelection({ sheetId, speechId, row: node.row });
    };

    const [isDragging, setIsDragging] = useState(false);

    const num = numberFor(sheetNodes, node.id);
    const showExtended = node.statuses.includes("extended");

    if (isEditing) {
        return (
            <textarea
                ref={inputRef}
                className="cell-input"
                rows={1}
                spellCheck={false}
                value={localText}
                onChange={(e) => {
                    setLocalText(e.target.value);
                    updateNodeText(node.id, e.target.value);
                    autoHeight();
                }}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        inputRef.current?.blur();
                        return;
                    }
                    if (e.key === "Backspace" && localText === "") {
                        e.preventDefault();
                        executeCommand("cell.clear");
                        return;
                    }
                    // The platform modifier+A selects all text in the cell;
                    // stop propagation so the global keymap doesn't fire sheet.newAff.
                    // On Mac this is Meta+A; elsewhere Ctrl+A.
                    const modKey = isMacPlatform() ? e.metaKey : e.ctrlKey;
                    if (e.key === "a" && modKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        inputRef.current?.select();
                        return;
                    }
                    // Plain Enter / Shift+Enter / Tab are handled by the keymap.
                    if (e.key === "Tab" || e.key === "Enter") {
                        // Don't intercept; let global keymap handle.
                        return;
                    }
                }}
            />
        );
    }

    const classes = [
        "",
        node.bold ? "arg-bold" : "",
        node.highlight ? "arg-highlight" : "",
        hasChildren ? "arg-parent" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <span
            draggable
            className={`transition-transform ${isDragging ? "arg-dragging" : "active:scale-[0.96]"}`}
            onDragStart={(e) => {
                e.dataTransfer.setData("text/df-node", node.id);
                e.dataTransfer.effectAllowed = "move";
                setIsDragging(true);
            }}
            onDragEnd={() => setIsDragging(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dragged = e.dataTransfer.getData("text/df-node");
                if (dragged && dragged !== node.id) {
                    const draggedNode = useRoundStore
                        .getState()
                        .round?.nodes.find((n) => n.id === dragged);
                    if (draggedNode) {
                        const format = useRoundStore.getState().round?.format;
                        const sheetId = draggedNode.sheetId;
                        const sheet = useRoundStore
                            .getState()
                            .round?.sheets.find((s) => s.id === sheetId);
                        if (format && sheet) {
                            const speeches = columnsForSheet(format, sheet);
                            const srcCol = speeches.findIndex((s) => s.id === draggedNode.speechId);
                            const tgtCol = speeches.findIndex((s) => s.id === node.speechId);
                            const dCol = tgtCol - (srcCol >= 0 ? srcCol : 0);
                            const dRow = node.row - draggedNode.row;
                            const moved = useRoundStore
                                .getState()
                                .commitSubtreeMove(dCol, dRow, dragged);
                            if (moved) {
                                useRoundStore.getState().setFlashNode(dragged);
                            }
                        }
                    }
                }
            }}
            onClick={handleClick}
            style={{
                display: "block",
                width: "100%",
                cursor: isDragging ? "grabbing" : "pointer",
                willChange: isDragging ? "transform, opacity" : undefined,
            }}
        >
            {autoNumber && num !== null && <span className="arg-num">{num}.</span>}
            {showExtended && <span className="arg-ext">↳</span>}
            <span className={classes || undefined}>{node.text}</span>
            {labelDrops && isDropped && (
                <span className="mark-drop" title="dropped" aria-label="dropped">
                    ⚠
                </span>
            )}
        </span>
    );
}
