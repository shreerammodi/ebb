"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLeaveDialog, type LeaveChoice } from "@/lib/store/useLeaveDialog";

const OPTIONS: { choice: LeaveChoice; label: string; detail: string }[] = [
    { choice: "save", label: "Save", detail: "Write to the existing file, then close." },
    { choice: "saveAs", label: "Save As...", detail: "Pick a location, then close." },
    {
        choice: "discard",
        label: "Don't save",
        detail: "Discard changes and close. The recovery copy is dropped.",
    },
];

/**
 * Asked on the way out of a flow whose file did not receive the round.
 *
 * Save holds the focus, because keeping the round is the answer a debater
 * pressing Enter by reflex should get. Escape and dismissal are Cancel, which
 * keeps the flow open: the one answer that cannot lose anything.
 */
export default function LeaveDialog() {
    const open = useLeaveDialog((s) => s.open);
    const answer = useLeaveDialog((s) => s.answer);

    // A caller waiting on a dialog that goes away with the tree would wait
    // forever, so leaving settles the question as cancel.
    useEffect(() => () => answer("cancel"), [answer]);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && answer("cancel")}>
            <DialogContent
                className="sm:max-w-2xl"
                showCloseButton={false}
                data-testid="leave-dialog"
            >
                <DialogTitle>You have unsaved changes. Save before closing?</DialogTitle>
                <DialogDescription className="sr-only">
                    The last save did not reach the flow file.
                </DialogDescription>
                <div className="grid gap-2 sm:grid-cols-3">
                    {OPTIONS.map(({ choice, label, detail }) => (
                        <Button
                            key={choice}
                            autoFocus={choice === "save"}
                            type="button"
                            variant="outline"
                            className="h-auto flex-col gap-1 py-3 whitespace-normal"
                            data-testid={`leave-${choice}`}
                            onClick={() => answer(choice)}
                        >
                            <span className="font-semibold">{label}</span>
                            <span className="text-muted-foreground text-xs font-normal">
                                {detail}
                            </span>
                        </Button>
                    ))}
                </div>
                <div className="flex justify-end">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="leave-cancel"
                        onClick={() => answer("cancel")}
                    >
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
