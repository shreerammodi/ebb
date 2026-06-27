"use client";

import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportOptions } from "@/lib/export/options";
import { downloadXlsx } from "@/lib/export/xlsx";
import type { Round } from "@/lib/model/types";
import { downloadRoundFile } from "@/lib/persistence/io";
import { useRoundStore } from "@/lib/store/useRoundStore";

export default function ExportMenu() {
    const autoNumber = useRoundStore((s) => s.autoNumber);
    const opts: ExportOptions = { autoNumber };

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
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="export-btn">
                    Export
                    <ChevronDown className="size-4 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    data-testid="export-json"
                    onSelect={() => run((r) => downloadRoundFile(r))}
                >
                    JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="export-excel"
                    onSelect={() => run((r) => downloadXlsx(r, opts))}
                >
                    Excel
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
