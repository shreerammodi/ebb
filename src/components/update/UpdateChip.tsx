"use client";

import { RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";

import { useUpdate } from "./UpdateProvider";

/**
 * A subtle "Update ready · Restart" chip. Appears only when a verified update
 * has been staged and applying it is safe (Tournament Mode off). Clicking
 * relaunches to apply. Renders nothing in every other
 * state, so it never nags mid-round.
 */
export default function UpdateChip() {
    const { state, applyAndRestart } = useUpdate();
    if (state.status !== "ready") return null;

    return (
        <button
            type="button"
            onClick={() => void applyAndRestart()}
            data-testid="update-chip"
            aria-label="Update ready — restart to apply"
            className={cn(
                "fixed right-4 bottom-4 z-50 flex items-center gap-1.5 rounded-full",
                "border-border bg-card text-foreground border px-3 py-1.5 text-[12px] shadow-sm",
                "hover:bg-accent transition-colors focus-visible:outline-2",
            )}
        >
            <RotateCw className="size-3.5" />
            <span className="font-medium">Update ready</span>
            <span className="text-muted-foreground">· Restart</span>
        </button>
    );
}
