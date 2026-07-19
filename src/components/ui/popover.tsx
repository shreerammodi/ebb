"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

import { asChildProps } from "@/components/ui/as-child";
import { cn } from "@/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
    return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger({
    asChild,
    children,
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger> & { asChild?: boolean }) {
    return (
        <PopoverPrimitive.Trigger
            data-slot="popover-trigger"
            {...props}
            {...asChildProps(asChild, children)}
        />
    );
}

function PopoverContent({
    className,
    align = "center",
    side,
    sideOffset = 4,
    ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
    Pick<
        React.ComponentProps<typeof PopoverPrimitive.Positioner>,
        "align" | "side" | "sideOffset"
    >) {
    return (
        <PopoverPrimitive.Portal>
            {/* z-index rides the Positioner, not the Popup: the Popup is
                position:static (its z-index is inert), and the Positioner's
                transform makes it the stacking context. Without this the
                popover lands below a z-50 dialog it opens over. */}
            <PopoverPrimitive.Positioner
                className="z-50"
                align={align}
                side={side}
                sideOffset={sideOffset}
            >
                <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className={cn(
                        "w-72 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none ease-out-quart data-[closed]:duration-100 data-[closed]:animate-out data-[closed]:fade-out-0 motion-safe:data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 motion-safe:data-[open]:zoom-in-95 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2",
                        className,
                    )}
                    {...props}
                />
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    );
}

export { Popover, PopoverTrigger, PopoverContent };
