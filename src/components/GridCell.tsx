'use client';

/**
 * GridCell — renders a single argument node cell in the flow grid.
 *
 * Reads selection/mode/actions from the zustand store directly.
 */

import { useRef, useEffect } from 'react';
import type { ArgumentNode } from '@/lib/model/types';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { numberFor } from '@/lib/model/numbering';

export interface GridCellProps {
  node: ArgumentNode;
  sheetId: string;
  speechId: string;
  isDropped: boolean;
  /** All nodes on this sheet (needed for numberFor). */
  sheetNodes: ArgumentNode[];
  /** True if this node has children (is a parent). */
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
  const selection = useRoundStore(s => s.selection);
  const mode = useRoundStore(s => s.mode);
  const keymapName = useRoundStore(s => s.keymapName);
  const setSelection = useRoundStore(s => s.setSelection);
  const updateNodeText = useRoundStore(s => s.updateNodeText);
  const setMode = useRoundStore(s => s.setMode);

  const isSelected =
    selection?.sheetId === sheetId &&
    selection?.speechId === speechId &&
    selection?.nodeId === node.id;

  // Default keymap: always editable when selected (no modal insert mode).
  const isInsertMode = isSelected && (mode === 'insert' || keymapName === 'default');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isInsertMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInsertMode]);

  const handleClick = () => {
    setSelection({ sheetId, speechId, nodeId: node.id });
  };

  const num = numberFor(sheetNodes, node.id);
  const showConceded = node.statuses.includes('conceded');
  const showExtended = node.statuses.includes('extended');

  if (isInsertMode) {
    return (
      <input
        ref={inputRef}
        className="cell-input"
        value={node.text}
        onChange={e => updateNodeText(node.id, e.target.value)}
        onBlur={() => setMode('normal')}
        onKeyDown={e => {
          if (e.key === 'Enter') setMode('normal');
        }}
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      style={{ display: 'block', width: '100%', cursor: 'pointer' }}
    >
      {num !== null && <span className="arg-num">{num}.</span>}
      <span className={hasChildren ? 'arg-parent' : undefined}>{node.text}</span>
      {isDropped && <> <span className="badge-drop">⚠ dropped</span></>}
      {showConceded && <> <span className="status-good">✓ conceded</span></>}
      {showExtended && <> <span className="status-good">✓ extended</span></>}
    </span>
  );
}
