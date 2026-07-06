"use client";

import { cn } from "@/lib/utils";

/**
 * The strip above a pane's grid. Shows the sheet title always (so a collapsed
 * sidebar still names the sheet); in split view it also carries the pane's
 * "Tab 1"/"Tab 2" label and an accent on the focused pane.
 */
export default function SheetTitleBar({
    title,
    tabLabel,
    focused,
}: {
    title: string;
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
            <span className="text-foreground truncate text-[13px] font-semibold">{title}</span>
        </div>
    );
}
