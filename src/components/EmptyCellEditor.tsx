"use client";

/**
 * EmptyCellEditor — shown when a blank cell is selected. The first keystroke
 * creates a real node (root in this column) and hands editing off to GridCell.
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
    const addNode = useRoundStore((s) => s.addNode);
    const setSelection = useRoundStore((s) => s.setSelection);
    const updateNodeText = useRoundStore((s) => s.updateNodeText);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    return (
        <textarea
            ref={ref}
            className="cell-input"
            rows={1}
            spellCheck={false}
            value=""
            onChange={(e) => {
                const id = addNode({
                    sheetId,
                    speechId,
                    parentId: null,
                    text: e.target.value,
                });
                updateNodeText(id, e.target.value);
                setSelection({ sheetId, speechId, nodeId: id });
            }}
        />
    );
}
