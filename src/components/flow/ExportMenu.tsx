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
import { downloadFlowFile } from "@/lib/persistence/flowIo";
import { useFlowStore } from "@/lib/store/useFlowStore";

export default function ExportMenu() {
    async function run(fn: (round: FlowRound) => unknown | Promise<unknown>) {
        const round = useFlowStore.getState().round;
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
                    onSelect={() => run((r) => downloadFlowFile(r))}
                >
                    JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="export-excel"
                    onSelect={() => run((r) => downloadXlsx(r))}
                >
                    Excel
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
