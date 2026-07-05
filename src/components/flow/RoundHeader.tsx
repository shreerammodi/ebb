"use client";

import { House, Settings } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { teamCode } from "@/lib/model/teamCode";
import { readFlowFile } from "@/lib/persistence/flowIo";
import { useFlowStore } from "@/lib/store/useFlowStore";

import ExportMenu from "./ExportMenu";
import SaveStatus from "./SaveStatus";

export default function RoundHeader() {
    const role = useFlowStore((s) => s.round?.role);
    const scouting = useFlowStore((s) => s.round?.scouting);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    function handleImportClick() {
        fileInputRef.current?.click();
    }

    async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const imported = await readFlowFile(file);
            useFlowStore.getState().loadRound(imported);
        } catch {
            toast.error("Failed to import: file may be invalid or from an incompatible version.");
        }
        e.target.value = "";
    }

    return (
        <header
            className="border-border bg-card flex h-12 flex-none items-center justify-between border-b px-4"
            data-testid="round-header"
        >

            <div className="flex items-center gap-3">
                <Link
                    href="/"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[13px]"
                    data-testid="back-to-flows"
                >
                    <House className="size-3.5" aria-hidden="true" />
                    Flows
                </Link>
                <span aria-hidden="true" className="bg-border h-4 w-px" />
                <span className="text-foreground text-sm font-semibold">{participants}</span>
                <SaveStatus />
            </div>

            <div className="no-print flex items-center gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    aria-label="Import round file"
                    className="hidden"
                    onChange={handleImportChange}
                    data-testid="import-file-input"
                />
                <Tip label="Guide" command="help.open">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useFlowStore.getState().setCheatsheetOpen(true)}
                        aria-label="Guide"
                        data-testid="guide-btn"
                    >
                        Guide
                    </Button>
                </Tip>
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
                <Tip label="Settings" command="settings.open">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useFlowStore.getState().setSettingsOpen(true)}
                        aria-label="Settings"
                        data-testid="settings-btn"
                    >
                        <Settings className="size-4" />
                    </Button>
                </Tip>
                <ExportMenu />
                <Tip label="Import round">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleImportClick}
                        data-testid="import-btn"
                    >
                        Import
                    </Button>
                </Tip>
            </div>
        </header>
    );
}
