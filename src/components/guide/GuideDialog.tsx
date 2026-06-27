"use client";

import { useEffect, useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GUIDE_SECTIONS } from "./sections";

export default function GuideDialog() {
    const open = useRoundStore((s) => s.guideOpen);
    const setGuideOpen = useRoundStore((s) => s.setGuideOpen);
    const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0].id);

    // Always reopen to the first section (Welcome).
    useEffect(() => {
        if (open) setActiveId(GUIDE_SECTIONS[0].id);
    }, [open]);

    const active =
        GUIDE_SECTIONS.find((s) => s.id === activeId) ?? GUIDE_SECTIONS[0];

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) setGuideOpen(false);
            }}
        >
            <DialogContent
                className="flex h-[80vh] max-h-[80vh] max-w-[760px] flex-col overflow-hidden p-0"
                data-testid="guide-dialog"
            >
                <DialogHeader className="shrink-0 border-b border-border px-[18px] pt-[14px] pb-2.5">
                    <DialogTitle className="text-sm font-semibold text-foreground">
                        How to use Debate Flow
                    </DialogTitle>
                </DialogHeader>

                <div className="flex min-h-0 flex-1">
                    <nav className="w-[180px] shrink-0 overflow-y-auto border-r border-border py-2">
                        {GUIDE_SECTIONS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                data-testid={`guide-section-${s.id}`}
                                onClick={() => setActiveId(s.id)}
                                className={cn(
                                    "block w-full px-[18px] py-1.5 text-left text-[13px] text-muted-foreground hover:text-foreground",
                                    s.id === activeId &&
                                        "font-medium text-foreground",
                                )}
                            >
                                {s.label}
                            </button>
                        ))}
                    </nav>

                    <div
                        className="flex-1 space-y-3 overflow-y-auto px-[22px] py-4 text-[13px] leading-relaxed text-foreground"
                        data-testid="guide-content"
                    >
                        <h2 className="text-[15px] font-semibold text-foreground">
                            {active.title}
                        </h2>
                        {active.body}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
