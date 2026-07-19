"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import * as React from "react";

import { asChildProps } from "@/components/ui/as-child";
import { Button } from "@/components/ui/button";
import { focusActiveHot } from "@/lib/grid/hotInstance";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger({
    asChild,
    children,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger> & { asChild?: boolean }) {
    return (
        <DialogPrimitive.Trigger
            data-slot="dialog-trigger"
            {...props}
            {...asChildProps(asChild, children)}
        />
    );
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal {...props} />;
}

function DialogClose({
    asChild,
    children,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Close> & { asChild?: boolean }) {
    return (
        <DialogPrimitive.Close
            data-slot="dialog-close"
            {...props}
            {...asChildProps(asChild, children)}
        />
    );
}

function DialogOverlay({
    className,
    animated = true,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop> & {
    animated?: boolean;
}) {
    return (
        <DialogPrimitive.Backdrop
            data-slot="dialog-overlay"
            className={cn(
                "fixed inset-0 z-50 bg-scrim",
                animated &&
                    "ease-out-quart data-[open]:animate-in data-[open]:fade-in-0 data-[open]:duration-200 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:duration-150",
                className,
            )}
            {...props}
        />
    );
}

function DialogContent({
    className,
    children,
    showCloseButton = true,
    animated = true,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
    showCloseButton?: boolean;
    // Keyboard-summoned surfaces (search palette) opt out of enter/exit
    // animation entirely: motion on a many-times-a-day path reads as latency.
    animated?: boolean;
}) {
    return (
        <DialogPortal>
            <DialogOverlay animated={animated} />
            <DialogPrimitive.Popup
                data-slot="dialog-content"
                // Closing an overlay over the flow hands focus straight back to
                // the grid instead of Base UI's default (the trigger), so the
                // next keystroke edits a cell rather than doing nothing.
                finalFocus={() => (focusActiveHot() ? false : true)}
                className={cn(
                    "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-card p-6 shadow-lg outline-none sm:max-w-lg",
                    animated &&
                        "ease-out-quart duration-200 data-[closed]:duration-150 data-[open]:animate-in data-[open]:fade-in-0 motion-safe:data-[open]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 motion-safe:data-[closed]:zoom-out-95",
                    className,
                )}
                {...props}
            >
                {children}
                {showCloseButton && (
                    <DialogPrimitive.Close
                        data-slot="dialog-close"
                        className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                    >
                        <X />
                        <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                )}
            </DialogPrimitive.Popup>
        </DialogPortal>
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="dialog-header"
            className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
            {...props}
        />
    );
}

function DialogFooter({
    className,
    showCloseButton = false,
    children,
    ...props
}: React.ComponentProps<"div"> & {
    showCloseButton?: boolean;
}) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        >
            {children}
            {showCloseButton && (
                <DialogPrimitive.Close render={<Button variant="outline">Close</Button>} />
            )}
        </div>
    );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            data-slot="dialog-title"
            className={cn("text-lg leading-none font-semibold text-balance", className)}
            {...props}
        />
    );
}

function DialogDescription({
    className,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            data-slot="dialog-description"
            className={cn("text-sm text-muted-foreground", className)}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
};
