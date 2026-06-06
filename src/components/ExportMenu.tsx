"use client";

import type { Round } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { downloadRoundFile } from "@/lib/persistence/io";
import { downloadXlsx } from "@/lib/export/xlsx";
import { downloadPdf } from "@/lib/export/pdf";
import type { ExportOptions } from "@/lib/export/options";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ExportMenu() {
  const autoNumber = useRoundStore((s) => s.autoNumber);
  const labelDrops = useRoundStore((s) => s.labelDrops);
  const opts: ExportOptions = { autoNumber, labelDrops };

  async function run(fn: (round: Round) => unknown | Promise<unknown>) {
    const round = useRoundStore.getState().round;
    if (!round) return;
    try {
      await fn(round);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="export-btn">
          Export ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          data-testid="export-json"
          onSelect={() => run((r) => downloadRoundFile(r))}
        >
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="export-excel" onSelect={() => run((r) => downloadXlsx(r, opts))}>
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="export-pdf" onSelect={() => run((r) => downloadPdf(r, opts))}>
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
