"use client";

/**
 * GridCell — renders a single argument node cell in the flow grid.
 *
 * Modeless: a cell enters edit mode when it is selected. The first printable
 * keystroke on an EMPTY cell is handled by EmptyCellEditor; here we just
 * render a textarea when selected.
 */

import { useRef, useEffect, useState } from "react";
import type { ArgumentNode } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { numberFor } from "@/lib/model/numbering";
import { executeCommand } from "@/lib/commands/commands";

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
        value={node.text}
        onChange={(e) => {
          updateNodeText(node.id, e.target.value);
          autoHeight();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            inputRef.current?.blur();
            return;
          }
          if (e.key === "Backspace" && node.text === "") {
            e.preventDefault();
            executeCommand("cell.clear");
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
    node.statuses.includes("conceded") ? "arg-crossed" : "",
    node.bold ? "arg-bold" : "",
    hasChildren ? "arg-parent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      draggable
      className={isDragging ? "arg-dragging" : undefined}
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
          useRoundStore.getState().setNodeParent(dragged, node.id);
          useRoundStore.getState().setFlashNode(dragged);
        }
      }}
      onClick={handleClick}
      style={{ display: "block", width: "100%", cursor: "pointer" }}
    >
      {autoNumber && num !== null && <span className="arg-num">{num}.</span>}
      {showExtended && <span className="arg-ext">↳</span>}
      <span className={classes || undefined}>{node.text}</span>
      {labelDrops && isDropped && (
        <>
          {" "}
          <span className="badge-drop">⚠ dropped</span>
        </>
      )}
    </span>
  );
}
