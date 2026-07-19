"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({
    className,
    ...props
}: React.ComponentProps<typeof SheetPrimitive.Backdrop>) {
    return (
        <SheetPrimitive.Backdrop
            data-slot="sheet-overlay"
            className={cn(
                "fixed inset-0 z-50 bg-scrim ease-out-quart data-[open]:animate-in data-[open]:fade-in-0 data-[open]:duration-200 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:duration-150",
                className,
            )}
            {...props}
        />
    );
}

function SheetContent({
    className,
    children,
    ...props
}: React.ComponentProps<typeof SheetPrimitive.Popup>) {
    return (
        <SheetPortal>
            <SheetOverlay />
            <SheetPrimitive.Popup
                data-slot="sheet-content"
                className={cn(
                    "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col gap-0 overflow-y-auto border-l border-border bg-card p-0 shadow-lg",
                    "ease-out-quart data-[open]:animate-in data-[open]:duration-250 motion-safe:data-[open]:slide-in-from-right motion-reduce:data-[open]:fade-in-0 data-[closed]:animate-out data-[closed]:duration-200 motion-safe:data-[closed]:slide-out-to-right motion-reduce:data-[closed]:fade-out-0",
                    className,
                )}
                {...props}
            >
                {children}
            </SheetPrimitive.Popup>
        </SheetPortal>
    );
}

const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
