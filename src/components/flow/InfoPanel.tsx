"use client";

import { X } from "@phosphor-icons/react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";
import { teamCode } from "@/lib/model/teamCode";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { cn } from "@/lib/utils";

export default function InfoPanel() {
    const open = useFlowStore((s) => s.infoOpen);
    if (!open) return null;
    return <InfoPanelInner />;
}

function InfoPanelInner() {
    const open = useFlowStore((s) => s.infoOpen);
    const round = useFlowStore((s) => s.round);
    const setInfoOpen = useFlowStore((s) => s.setInfoOpen);
    const setScouting = useFlowStore((s) => s.setScouting);

    if (!round) return null;
    const sc = round.scouting;

    const affCode = teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second);
    const negCode = teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second);

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) setInfoOpen(false);
            }}
        >
            <DialogContent
                showCloseButton={false}
                aria-label="Round info"
                data-testid="info-panel"
                className="gap-0 overflow-hidden p-0 sm:max-w-[640px]"
            >
                <div className="border-border flex items-center justify-between border-b px-3.5 py-3">
                    <DialogTitle className="text-foreground text-[13px] font-semibold tracking-wide">
                        Round Info
                    </DialogTitle>
                    <Tip label="Close">
                        <DialogClose
                            aria-label="Close info"
                            data-testid="info-close"
                            className="text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-2"
                        >
                            <X weight="bold" className="size-4" />
                        </DialogClose>
                    </Tip>
                </div>

                <div className="max-h-[78vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4 p-4">
                        <div className="flex flex-col gap-2">
                            <div className="text-aff font-mono text-[9px] font-bold tracking-widest uppercase">
                                Aff — {affCode || "—"}
                            </div>
                            <Input
                                data-testid="scout-affSchool"
                                placeholder="Aff school"
                                value={sc.affSchool ?? ""}
                                onChange={(e) => setScouting({ affSchool: e.target.value })}
                            />
                            <DebaterRow
                                label="1A"
                                value={sc.aff.first}
                                onChange={(d) =>
                                    setScouting({
                                        aff: { ...sc.aff, first: d },
                                    })
                                }
                                testid="scout-aff-1a"
                            />
                            <DebaterRow
                                label="2A"
                                value={sc.aff.second}
                                onChange={(d) =>
                                    setScouting({
                                        aff: { ...sc.aff, second: d },
                                    })
                                }
                                testid="scout-aff-2a"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="text-neg font-mono text-[9px] font-bold tracking-widest uppercase">
                                Neg — {negCode || "—"}
                            </div>
                            <Input
                                data-testid="scout-negSchool"
                                placeholder="Neg school"
                                value={sc.negSchool ?? ""}
                                onChange={(e) => setScouting({ negSchool: e.target.value })}
                            />
                            <DebaterRow
                                label="1N"
                                value={sc.neg.first}
                                onChange={(d) =>
                                    setScouting({
                                        neg: { ...sc.neg, first: d },
                                    })
                                }
                                testid="scout-neg-1n"
                            />
                            <DebaterRow
                                label="2N"
                                value={sc.neg.second}
                                onChange={(d) =>
                                    setScouting({
                                        neg: { ...sc.neg, second: d },
                                    })
                                }
                                testid="scout-neg-2n"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 px-4 pb-3">
                        <Input
                            data-testid="scout-tournament"
                            placeholder="Tournament"
                            value={sc.tournament ?? ""}
                            onChange={(e) => setScouting({ tournament: e.target.value })}
                        />
                        <Input
                            data-testid="scout-round"
                            placeholder="Round"
                            value={sc.round ?? ""}
                            onChange={(e) => setScouting({ round: e.target.value })}
                        />
                        <Input
                            data-testid="scout-date"
                            placeholder="Date"
                            value={sc.date ?? ""}
                            onChange={(e) => setScouting({ date: e.target.value })}
                        />
                        <Input
                            data-testid="scout-judge"
                            placeholder="Judge"
                            value={sc.judge ?? ""}
                            onChange={(e) => setScouting({ judge: e.target.value })}
                        />
                    </div>

                    <div className="flex flex-col gap-2 px-4 pb-4">
                        <div className="text-muted-foreground font-mono text-[9px] font-bold tracking-widest uppercase">
                            Decision
                        </div>
                        <div className="flex gap-2 text-[13px]" role="group" aria-label="Vote">
                            {(["aff", "neg"] as const).map((side) => {
                                const selected = sc.decision?.vote === side;
                                return (
                                    <button
                                        key={side}
                                        type="button"
                                        data-testid={`scout-vote-${side}`}
                                        aria-pressed={selected}
                                        onClick={() =>
                                            setScouting({
                                                decision: {
                                                    ...sc.decision,
                                                    // Click the selected side again to clear back to undecided.
                                                    vote: selected ? undefined : side,
                                                },
                                            })
                                        }
                                        className={cn(
                                            "rounded-md border px-3 py-1 font-medium transition-colors",
                                            selected && side === "aff"
                                                ? "border-aff bg-aff/10 text-aff"
                                                : selected && side === "neg"
                                                  ? "border-neg bg-neg/10 text-neg"
                                                  : "border-input text-muted-foreground hover:bg-accent/50",
                                        )}
                                    >
                                        {side === "aff" ? "Aff" : "Neg"}
                                    </button>
                                );
                            })}
                        </div>
                        <textarea
                            className="cell-input border-border rounded border p-2 text-[13px]"
                            rows={3}
                            placeholder="RFD"
                            value={sc.decision?.rfd ?? ""}
                            data-testid="scout-rfd"
                            onChange={(e) =>
                                setScouting({
                                    decision: {
                                        ...sc.decision,
                                        rfd: e.target.value,
                                    },
                                })
                            }
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function DebaterRow({
    label,
    value,
    onChange,
    testid,
}: {
    label: string;
    value: { first: string; last: string };
    onChange: (d: { first: string; last: string }) => void;
    testid: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-7 text-[11px]">{label}</span>
            <Input
                data-testid={`${testid}-first`}
                placeholder="First"
                value={value.first}
                onChange={(e) => onChange({ ...value, first: e.target.value })}
            />
            <Input
                data-testid={`${testid}-last`}
                placeholder="Last"
                value={value.last}
                onChange={(e) => onChange({ ...value, last: e.target.value })}
            />
        </div>
    );
}
