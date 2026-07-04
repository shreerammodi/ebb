"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { FlowRound } from "@/lib/model/flow";
import { teamCode } from "@/lib/model/teamCode";
import { loadFlow } from "@/lib/persistence/flowPersistence";

export interface FlowDetailDrawerProps {
    id: string | null;
    onClose: () => void;
    onChanged: () => void;
}

function fullName(d: { first: string; last: string }): string {
    return `${d.first} ${d.last}`.trim() || "—";
}

export default function FlowDetailDrawer({ id, onClose }: FlowDetailDrawerProps) {
    const router = useRouter();
    const [round, setRound] = useState<FlowRound | null>(null);

    useEffect(() => {
        let on = true;
        // Clear immediately so reopening for a new id never flashes the
        // previous flow's details while the new one loads.
        setRound(null);
        if (id) loadFlow(id).then((r) => on && setRound(r ?? null));
        return () => {
            on = false;
        };
    }, [id]);

    const open = id !== null;
    const sc = round?.scouting;

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent>
                {round && sc ? (
                    <div className="flex h-full flex-col">
                        <div className="border-border border-b p-5">
                            <SheetTitle className="text-[15px] font-semibold text-pretty">
                                <span className="text-aff">
                                    {teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second) ||
                                        "Untitled Aff"}
                                </span>
                                <span className="text-muted-foreground px-1.5">vs</span>
                                <span className="text-neg">
                                    {teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second) ||
                                        "Untitled Neg"}
                                </span>
                            </SheetTitle>
                        </div>
                        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-[13px]">
                            <Row label="Aff school" value={sc.affSchool || "—"} />
                            <Row label="1A" value={fullName(sc.aff.first)} />
                            <Row label="2A" value={fullName(sc.aff.second)} />
                            <Row label="Neg school" value={sc.negSchool || "—"} />
                            <Row label="1N" value={fullName(sc.neg.first)} />
                            <Row label="2N" value={fullName(sc.neg.second)} />
                            <Row label="Tournament" value={sc.tournament || "—"} />
                            <Row label="Round" value={sc.round || "—"} />
                            <Row label="Date" value={sc.date || "—"} />
                            <Row label="Judge" value={sc.judge || "—"} />
                            <Row
                                label="Decision"
                                value={
                                    sc.decision?.vote ? sc.decision.vote.toUpperCase() : "undecided"
                                }
                            />
                            {sc.decision?.rfd && <Row label="RFD" value={sc.decision.rfd} />}
                            <Row label="Role" value={round.role} />
                            <Row
                                label="Sheets"
                                value={String(round.sheets.filter((s) => s.kind !== "cx").length)}
                            />
                        </div>
                        <div className="border-border flex gap-2 border-t p-4">
                            <Button size="sm" onClick={() => router.push(`/flow?id=${round.id}`)}>
                                Open in editor
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-muted-foreground p-5 text-[13px]">Loading…</div>
                )}
            </SheetContent>
        </Sheet>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[96px_1fr] gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span>{value}</span>
        </div>
    );
}
