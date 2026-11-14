"use client";

import { Export } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/errorMessage";
import { saveXlsx } from "@/lib/export/xlsx";
import { useFlowStore } from "@/lib/store/useFlowStore";

/**
 * Excel is the only export, so the button goes straight to the save panel
 * with no menu between. A .ebb file already is the round's JSON, and Save As
 * writes one wherever the user wants it.
 */
export default function ExportButton() {
    async function exportExcel() {
        const { round, contacts, docPath } = useFlowStore.getState();
        if (!round) return;
        try {
            await saveXlsx(round, contacts, docPath);
        } catch (err) {
            toast.error(`Export failed: ${errorMessage(err, "unknown error")}`);
        }
    }

    return (
        <Tip label="Export to Excel">
            <Button
                variant="outline"
                size="sm"
                aria-label="Export"
                data-testid="export-btn"
                onClick={exportExcel}
            >
                <Export className="size-4" />
                <span className="ribbon:inline hidden">Export</span>
            </Button>
        </Tip>
    );
}
