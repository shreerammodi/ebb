"use client";

/**
 * EmptyCellEditor — shown when a blank cell is selected. The first keystroke
 * creates a BARE node (parentId: null) at the exact cell and hands editing
 * off to GridCell by setting selection to the now-occupied cell.
 */
import { useEffect, useRef } from "react";

import { useRoundStore } from "@/lib/store/useRoundStore";

export default function EmptyCellEditor({
    sheetId,
    speechId,
}: {
    sheetId: string;
    speechId: string;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    // Read selection to discover which row we're editing.
    const selection = useRoundStore((s) => s.selection);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    const row =
        selection?.sheetId === sheetId && selection?.speechId === speechId ? selection.row : 0;

    return (
        <textarea
            ref={ref}
            className="cell-input"
            rows={1}
            spellCheck={false}
            value=""
            onChange={(e) => {
                const store = useRoundStore.getState();
                const pending = store.pendingSpawn;
                // If a deferred Enter/Shift+Enter spawn is armed for this cell, the
                // first keystroke creates the node with its inherited parent link.
                // Otherwise this is a plain blank cell — create a bare node.
                if (
                    pending &&
                    pending.sheetId === sheetId &&
                    pending.speechId === speechId &&
                    pending.row === row
                ) {
                    store.commitPendingSpawn(e.target.value);
                } else {
                    store.placeBareNode({ sheetId, speechId, row }, e.target.value);
                }
                // Selection stays on the cell; GridCell now renders.
            }}
            onKeyDown={(e) => {
                // Escape abandons an armed spawn (reversing any shift) and leaves
                // the cell blank.
                if (e.key === "Escape") {
                    e.preventDefault();
                    useRoundStore.getState().abandonPendingSpawn();
                    ref.current?.blur();
                }
            }}
        />
    );
}
