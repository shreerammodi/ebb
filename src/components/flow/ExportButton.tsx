"use client";

import { Export } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { exportOpenFlow } from "@/lib/commands/fileCommands";

/**
 * Excel is the only export, so the button goes straight to the save panel
 * with no menu between. A .ebb file already is the round's JSON, and Save As
 * writes one wherever the user wants it.
 */
export default function ExportButton() {
    return (
        <Tip label="Export to Excel">
            <Button
                variant="outline"
                size="sm"
                aria-label="Export"
                data-testid="export-btn"
                onClick={() => void exportOpenFlow()}
            >
                <Export className="size-4" />
                <span className="ribbon:inline hidden">Export</span>
            </Button>
        </Tip>
    );
}
