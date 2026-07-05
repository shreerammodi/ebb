"use client";

import { Ellipsis } from "lucide-react";
import { toast } from "sonner";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runExport } from "@/lib/export/run";
import { loadFlow, restoreFlow, softDeleteFlow } from "@/lib/persistence/flowPersistence";

export interface FlowCardMenuProps {
    id: string;
    onViewDetails: (id: string) => void;
    onChanged: () => void;
}

export default function FlowCardMenu({ id, onViewDetails, onChanged }: FlowCardMenuProps) {
    async function exportAs(fmt: "json" | "excel") {
        const round = await loadFlow(id);
        if (!round) return;
        try {
            await runExport(round, fmt);
        } catch (err) {
            toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    }

    async function del() {
        await softDeleteFlow(id);
        onChanged();
        toast("Flow moved to trash", {
            action: {
                label: "Undo",
                onClick: async () => {
                    await restoreFlow(id);
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
                    className="bg-accent text-muted-foreground hover:bg-accent/70 absolute top-3.5 right-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <Ellipsis className="size-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                    data-testid={`kebab-details-${id}`}
                    onSelect={() => onViewDetails(id)}
                >
                    View details
                </DropdownMenuItem>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onSelect={() => void exportAs("json")}>
                            JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void exportAs("excel")}>
                            Excel
                        </DropdownMenuItem>
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
