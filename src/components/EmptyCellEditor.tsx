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
    parentId?: string | null;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    // Read selection to discover which row we're editing.
    const selection = useRoundStore((s) => s.selection);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    const row =
        selection?.sheetId === sheetId && selection?.speechId === speechId
            ? selection.row
            : 0;

    return (
        <textarea
            ref={ref}
            className="cell-input"
            rows={1}
            spellCheck={false}
            value=""
            onChange={(e) => {
                const id = useRoundStore
                    .getState()
                    .placeBareNode({ sheetId, speechId, row }, e.target.value);
                useRoundStore.getState().updateNodeText(id, e.target.value);
                // Selection stays on the cell; GridCell now renders.
            }}
        />
    );
}