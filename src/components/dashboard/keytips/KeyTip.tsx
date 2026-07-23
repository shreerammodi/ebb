"use client";

import { m } from "motion/react";
import { useEffect, useRef } from "react";

import { Kbd } from "@/components/ui/kbd";
import type { KeyTipGroup, KeyTipMode, KeytipId } from "@/lib/dashboard/keytips";
import { cn } from "@/lib/utils";

import { useKeyTips } from "./KeyTipsProvider";

type Placement = "tl" | "tr" | "bl" | "br" | "c";

const PLACEMENT: Record<Placement, string> = {
    tl: "-top-2 -left-2",
    tr: "-top-2 -right-2",
    bl: "-bottom-2 -left-2",
    br: "-bottom-2 -right-2",
    c: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

export interface KeyTipProps {
    /** Keytip identity; its chord and group come from the effective config. */
    id: KeytipId;
    /** Action to run when the chord is pressed. */
    run: () => void;
    /** Mode to enter afterward; defaults to closing the overlay. */
    next?: KeyTipMode;
    placement?: Placement;
    className?: string;
    children: React.ReactNode;
}

/**
 * Wraps an actionable control, registering its chord with the overlay and
 * painting a keycap over it while its group is live. Wrapping keeps the badge
 * glued to the control, so it follows layout without any measurement.
 */
export function KeyTip({
    id,
    run,
    next = "off",
    placement = "tl",
    className,
    children,
}: KeyTipProps) {
    const { mode, register, keytips } = useKeyTips();
    const group = id.split(".")[0] as KeyTipGroup;
    const chord = keytips[id];
    // The run closure changes every render; mirror it into a ref so the
    // registration below stays stable instead of re-registering each render.
    const runRef = useRef(run);
    useEffect(() => {
        runRef.current = run;
    });

    useEffect(() => {
        if (!chord) return;
        return register(group, chord, { run: () => runRef.current(), next });
    }, [register, group, chord, next]);

    return (
        <span className={cn("relative inline-flex", className)}>
            {children}
            {mode === group && chord && (
                <m.span
                    data-testid={`keytip-${id}`}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.12, ease: [0.25, 1, 0.5, 1] }}
                    className={cn("pointer-events-none absolute z-50 flex", PLACEMENT[placement])}
                >
                    <Kbd className="border-primary bg-primary text-primary-foreground shadow-sm">
                        {chord}
                    </Kbd>
                </m.span>
            )}
        </span>
    );
}
