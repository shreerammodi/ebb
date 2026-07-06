"use client";

import { cn } from "@/lib/utils";

/**
 * The strip above a pane's grid. Shows the sheet title always (so a collapsed
 * sidebar still names the sheet); the title wears its side color (aff blue,
 * neg red). In split view it also carries the pane's "Tab 1"/"Tab 2" label and
 * an accent on the focused pane.
 */
export default function SheetTitleBar({
    title,
    side,
    tabLabel,
    focused,
}: {
    title: string;
    side: "aff" | "neg";
    tabLabel?: string;
    focused?: boolean;
}) {
    return (
        <div
            data-testid="sheet-title-bar"
            data-focused={focused ? "true" : undefined}
            className={cn(
                "border-border bg-card flex h-8 shrink-0 items-center gap-2 border-b px-3",
                focused && "border-b-foreground/40",
            )}
        >
            {tabLabel && (
                <span className="text-muted-foreground font-mono text-[9px] font-bold tracking-widest uppercase">
                    {tabLabel}
                </span>
            )}
            <span
                className={cn(
                    "truncate text-[13px] font-semibold",
                    side === "aff" ? "text-aff" : "text-neg",
                )}
            >
                {title}
            </span>
        </div>
    );
}
