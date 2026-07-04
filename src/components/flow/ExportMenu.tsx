"use client";

import { CaretDown } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { downloadXlsx } from "@/lib/export/xlsx";
import type { FlowRound } from "@/lib/model/flow";
import type { Round } from "@/lib/model/types";
import { downloadRoundFile } from "@/lib/persistence/io";
import { useRoundStore } from "@/lib/store/useRoundStore";

export default function ExportMenu() {
    async function run(fn: (round: Round) => unknown | Promise<unknown>) {
        const round = useRoundStore.getState().round;
        if (!round) return;
        try {
            await fn(round);
        } catch (err) {
            toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    }

    return (
        <DropdownMenu>
            <Tip label="Export round">
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="export-btn">
                        Export
                        <CaretDown weight="bold" className="size-4 opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    data-testid="export-json"
                    onSelect={() => run((r) => downloadRoundFile(r))}
                >
                    JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="export-excel"
                    // Legacy-store bridge; dies when the editor flips to the flow store.
                    onSelect={() => run((r) => downloadXlsx(r as unknown as FlowRound))}
                >
                    Excel
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
