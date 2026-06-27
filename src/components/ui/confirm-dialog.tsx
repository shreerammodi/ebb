"use client";

import { Button } from "./button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "./dialog";

export interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Style the confirm action as destructive (red). */
    destructive?: boolean;
    onConfirm: () => void;
}

/**
 * A small in-app replacement for `window.confirm` — same focus-trap, escape,
 * and visual language as the rest of the app's dialogs, instead of an
 * OS-chrome modal that breaks the "precise, invisible" voice at the most
 * irreversible moments.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="sm:max-w-[420px]"
                data-testid="confirm-dialog"
            >
                <DialogTitle>{title}</DialogTitle>
                {description && <DialogDescription>{description}</DialogDescription>}
                <DialogFooter className="mt-2">
                    <DialogClose asChild>
                        <Button variant="outline" data-testid="confirm-cancel">
                            {cancelLabel}
                        </Button>
                    </DialogClose>
                    <Button
                        variant={destructive ? "destructive" : "default"}
                        data-testid="confirm-accept"
                        onClick={() => {
                            onConfirm();
                            onOpenChange(false);
                        }}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
