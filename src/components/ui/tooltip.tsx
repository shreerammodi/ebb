"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import type { CommandId } from "@/lib/commands/registry";
import { keyHintFor } from "@/lib/keymap/displayChord";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { cn } from "@/lib/utils";

function TooltipProvider({
    delayDuration = 500,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
    return (
        <TooltipPrimitive.Provider
            data-slot="tooltip-provider"
            delayDuration={delayDuration}
            {...props}
        />
    );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
    return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
    return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
    className,
    sideOffset = 4,
    children,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                data-slot="tooltip-content"
                sideOffset={sideOffset}
                className={cn(
                    "bg-foreground text-background z-50 flex items-center gap-2 rounded-md px-2 py-1 text-xs shadow-md select-none origin-(--radix-tooltip-content-transform-origin) ease-out-quart animate-in fade-in-0 motion-safe:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100",
                    className,
                )}
                {...props}
            >
                {children}
                <TooltipPrimitive.Arrow className="fill-foreground" />
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    );
}

interface TipProps {
    label: React.ReactNode;
    command?: CommandId;
    side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
    /**
     * Show only on hover, never on focus. Radix composes the trigger's onFocus
     * before its own open handler, so preventing the focus default skips the
     * open. Set this on a trigger a dialog auto-focuses on open (e.g. a Close
     * button) so the tip does not pop up unprompted every time the dialog opens.
     */
    hoverOnly?: boolean;
    children: React.ReactNode;
}

function Tip({ label, command, side, hoverOnly, children }: TipProps) {
    const tooltips = useFlowStore((s) => s.tooltips);
    const hint = command ? keyHintFor(command) : null;
    if (!tooltips) return children;
    return (
        <Tooltip>
            <TooltipTrigger asChild onFocus={hoverOnly ? (e) => e.preventDefault() : undefined}>
                {children}
            </TooltipTrigger>
            <TooltipContent side={side}>
                <span>{label}</span>
                {hint && (
                    <kbd
                        data-slot="tooltip-kbd"
                        className="border-background/30 text-background/80 rounded border px-1 font-mono text-[10px]"
                    >
                        {hint}
                    </kbd>
                )}
            </TooltipContent>
        </Tooltip>
    );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Tip };
