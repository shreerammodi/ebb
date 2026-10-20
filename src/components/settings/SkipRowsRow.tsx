"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { useFlowStore } from "@/lib/store/useFlowStore";

import SettingRow from "./SettingRow";

/**
 * How far Skip down moves. The field holds a draft only while it is being
 * typed in, so clearing it to type a new count stores nothing until it
 * commits, and outside an edit it shows whatever the store holds.
 */
export default function SkipRowsRow() {
    const skipRows = useFlowStore((s) => s.skipRows);
    const setSkipRows = useFlowStore((s) => s.setSkipRows);
    const [draft, setDraft] = useState<string | null>(null);

    function commit() {
        const n = parseInt(draft ?? "", 10);
        if (!Number.isNaN(n)) setSkipRows(n);
        setDraft(null);
    }

    return (
        <SettingRow
            title="Skip down"
            description="How many rows Skip down moves the cursor, leaving room for the answers the next speech puts beside an argument."
            control={
                <div className="flex items-center gap-1">
                    <Input
                        type="text"
                        inputMode="numeric"
                        value={draft ?? String(skipRows)}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        aria-label="Rows to skip down"
                        data-testid="skip-rows-input"
                        className="h-8 w-16 text-right tabular-nums"
                    />
                    <span className="text-muted-foreground text-[13px]">rows</span>
                </div>
            }
        />
    );
}
