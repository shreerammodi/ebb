"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFlowStore } from "@/lib/store/useFlowStore";

export default function BulkAddSheetsDialog() {
    const open = useFlowStore((s) => s.bulkAddOpen);
    if (!open) return null;
    return <BulkAddSheetsDialogInner />;
}

function BulkAddSheetsDialogInner() {
    const setBulkAddOpen = useFlowStore((s) => s.setBulkAddOpen);
    const addSheets = useFlowStore((s) => s.addSheets);
    const [aff, setAff] = useState(1);
    const [neg, setNeg] = useState(1);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const inputs = [
            ...Array.from({ length: Math.max(0, aff) }, () => ({ group: "aff" as const })),
            ...Array.from({ length: Math.max(0, neg) }, () => ({ group: "neg" as const })),
        ];
        if (inputs.length) addSheets(inputs);
        setBulkAddOpen(false);
    }

    return (
        <Dialog
            open
            onOpenChange={(o) => {
                if (!o) setBulkAddOpen(false);
            }}
        >
            <DialogContent aria-label="Bulk add sheets" data-testid="bulk-add-dialog">
                <DialogTitle>Bulk add sheets</DialogTitle>
                <form onSubmit={submit} className="flex flex-col gap-4">
                    <div className="flex gap-4">
                        <Label className="flex-1 flex-col items-start gap-1.5">
                            Aff sheets
                            <Input
                                type="number"
                                min={0}
                                autoFocus
                                value={aff}
                                onChange={(e) => setAff(e.target.valueAsNumber || 0)}
                                data-testid="bulk-add-aff"
                            />
                        </Label>
                        <Label className="flex-1 flex-col items-start gap-1.5">
                            Neg sheets
                            <Input
                                type="number"
                                min={0}
                                value={neg}
                                onChange={(e) => setNeg(e.target.valueAsNumber || 0)}
                                data-testid="bulk-add-neg"
                            />
                        </Label>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" data-testid="bulk-add-submit">
                            Add sheets
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
