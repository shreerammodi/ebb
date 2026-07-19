"use client";

import { Gear, House, Info } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { teamCode } from "@/lib/model/teamCode";
import { useFlowStore } from "@/lib/store/useFlowStore";

import ExportMenu from "./ExportMenu";
import SaveStatus from "./SaveStatus";
import SpeechSwitcher from "./SpeechSwitcher";
import ZoomControl from "./ZoomControl";

export default function RoundHeader() {
    const role = useFlowStore((s) => s.round?.role);
    const scouting = useFlowStore((s) => s.round?.scouting);

    if (!role || !scouting) return null;

    const affCode =
        teamCode(scouting.affSchool ?? "", scouting.aff.first, scouting.aff.second) || "Aff";
    const negCode =
        teamCode(scouting.negSchool ?? "", scouting.neg.first, scouting.neg.second) || "Neg";
    const participants =
        role === "judge"
            ? `${affCode} (Aff) vs ${negCode} (Neg)`
            : role === "neg"
              ? `${negCode} vs ${affCode}`
              : `${affCode} vs ${negCode}`;

    return (
        <header
            className="border-border bg-card flex h-12 flex-none items-center gap-4 border-b px-4"
            data-testid="round-header"
        >
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <Link
                    href="/"
                    className="text-muted-foreground hover:text-foreground flex flex-none items-center gap-1.5 text-[13px]"
                    data-testid="back-to-flows"
                >
                    <House className="size-4" aria-hidden="true" />
                    Flows
                </Link>
                <span aria-hidden="true" className="bg-border h-4 w-px flex-none" />
                <span className="text-foreground truncate text-sm font-semibold">
                    {participants}
                </span>
                <SaveStatus />
            </div>

            <div className="no-print flex flex-none items-center gap-2">
                <SpeechSwitcher />
                <ZoomControl />
                <Tip label="Round info" command="info.open">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useFlowStore.getState().setInfoOpen(true)}
                        aria-label="Round info"
                        data-testid="info-btn"
                    >
                        Info
                    </Button>
                </Tip>
                <Tip label="RFD" command="rfd.toggle">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            const s = useFlowStore.getState();
                            s.setRfdOpen(!s.rfdOpen);
                        }}
                        aria-label="RFD"
                        data-testid="rfd-btn"
                    >
                        RFD
                    </Button>
                </Tip>
                <Tip label="Keyboard shortcuts" command="help.open">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useFlowStore.getState().setCheatsheetOpen(true)}
                        aria-label="Keyboard shortcuts"
                        data-testid="guide-btn"
                    >
                        <Info className="size-4.5" />
                    </Button>
                </Tip>
                <Tip label="Settings" command="settings.open">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useFlowStore.getState().setSettingsOpen(true)}
                        aria-label="Settings"
                        data-testid="settings-btn"
                    >
                        <Gear className="size-4.5" />
                    </Button>
                </Tip>
                <ExportMenu />
            </div>
        </header>
    );
}
