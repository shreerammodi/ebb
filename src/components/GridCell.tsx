"use client";

/**
 * GridCell — renders a single argument node cell in the flow grid.
 *
 * Reads selection/mode/actions from the zustand store directly.
 */

import { useRef, useEffect } from "react";
import type { ArgumentNode } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { numberFor } from "@/lib/model/numbering";
import { executeCommand } from "@/lib/commands/commands";

export interface GridCellProps {
  node: ArgumentNode;
  sheetId: string;
  speechId: string;
  isDropped: boolean;
  /** All nodes on this sheet (needed for numberFor). */
  sheetNodes: ArgumentNode[];
  /** True if this node has children (is a parent). */
  hasChildren: boolean;
  /** True when rendered inside a CX sheet — suppresses numbering and badges. */
  isCx?: boolean;
}

export default function GridCell({
  node,
  sheetId,
  speechId,
  isDropped,
  sheetNodes,
  hasChildren,
  isCx,
}: GridCellProps) {
  const selection = useRoundStore((s) => s.selection);
  const mode = useRoundStore((s) => s.mode);
  const keymapName = useRoundStore((s) => s.keymapName);
  const setSelection = useRoundStore((s) => s.setSelection);
  const updateNodeText = useRoundStore((s) => s.updateNodeText);
  const setMode = useRoundStore((s) => s.setMode);
  const autoNumber = useRoundStore((s) => s.autoNumber);
  const labelDrops = useRoundStore((s) => s.labelDrops);

  const isSelected =
    selection?.sheetId === sheetId &&
    selection?.speechId === speechId &&
    selection?.nodeId === node.id;

  // Default keymap: always editable when selected (no modal insert mode).
  const isInsertMode = isSelected && (mode === "insert" || keymapName === "default");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit its content so it occupies the same space the
  // rendered text would — the cell itself is the only visible box.
  const autoHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (isInsertMode && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      // A freshly-mounted textarea defaults its caret to position 0. When editing
      // is handed off from EmptyCellEditor (first keystroke creates the node), that
      // would drop the caret to the LEFT of the just-typed letter — put it at the end.
      const end = el.value.length;
      el.setSelectionRange(end, end);
      autoHeight();
    }
  }, [isInsertMode]);

  const handleClick = () => {
    setSelection({ sheetId, speechId, nodeId: node.id });
  };

  const num = numberFor(sheetNodes, node.id);
  const showExtended = node.statuses.includes("extended");

  if (isInsertMode) {
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
        onBlur={() => setMode("normal")}
        onKeyDown={(e) => {
          // Single-line cells: never insert a literal newline.
          // Backspace on an empty cell deletes the node (and reselects a neighbor).
          if (e.key === "Backspace" && node.text === "") {
            e.preventDefault();
            executeCommand("node.delete");
            return;
          }
          // Plain Enter / Shift+Enter are handled by the global keymap layer
          // (node.addAnswer / node.answerAcross). Do not intercept them here.
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
      onDragStart={(e) => {
        e.dataTransfer.setData("text/df-node", node.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const dragged = e.dataTransfer.getData("text/df-node");
        if (dragged && dragged !== node.id) {
          useRoundStore.getState().setNodeParent(dragged, node.id);
        }
      }}
      onClick={handleClick}
      style={{ display: "block", width: "100%", cursor: "pointer" }}
    >
      {!isCx && autoNumber && num !== null && <span className="arg-num">{num}.</span>}
      {!isCx && showExtended && <span className="arg-ext">↳</span>}
      <span className={classes || undefined}>{node.text}</span>
      {!isCx && labelDrops && isDropped && (
        <>
          {" "}
          <span className="badge-drop">⚠ dropped</span>
        </>
      )}
    </span>
  );
}
