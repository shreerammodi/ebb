"use client";

import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { loadRound, softDeleteRound, restoreRound } from "@/lib/persistence/autosave";
import { runExport } from "@/lib/export/run";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface FlowCardMenuProps {
  id: string;
  onViewDetails: (id: string) => void;
  onChanged: () => void;
}

export default function FlowCardMenu({ id, onViewDetails, onChanged }: FlowCardMenuProps) {
  const autoNumber = useRoundStore((s) => s.autoNumber);

  async function exportAs(fmt: "json" | "excel") {
    const round = await loadRound(id);
    if (!round) return;
    try {
      await runExport(round, { autoNumber }, fmt);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  async function del() {
    await softDeleteRound(id);
    onChanged();
    toast("Flow moved to trash", {
      action: {
        label: "Undo",
        onClick: async () => {
          await restoreRound(id);
          onChanged();
        },
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`kebab-${id}`}
          aria-label="Flow actions"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3.5 right-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-accent text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent/70 focus-visible:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem data-testid={`kebab-details-${id}`} onSelect={() => onViewDetails(id)}>
          View details
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => void exportAs("json")}>JSON</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportAs("excel")}>Excel</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          data-testid={`kebab-delete-${id}`}
          onSelect={() => void del()}
          className="text-destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
