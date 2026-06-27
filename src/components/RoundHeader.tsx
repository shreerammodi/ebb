"use client";

import { useRef } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { readRoundFile } from "@/lib/persistence/io";
import { Button } from "@/components/ui/button";
import ExportMenu from "./ExportMenu";
import SaveStatus from "./SaveStatus";
import { teamCode } from "@/lib/model/teamCode";

export default function RoundHeader() {
    const round = useRoundStore((s) => s.round);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!round) return null;

    const { role, scouting } = round;

    const affCode =
        teamCode(
            scouting.affSchool ?? "",
            scouting.aff.first,
            scouting.aff.second,
        ) || "Aff";
    const negCode =
        teamCode(
            scouting.negSchool ?? "",
            scouting.neg.first,
            scouting.neg.second,
        ) || "Neg";
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
            const imported = await readRoundFile(file);
            useRoundStore.setState({
                round: imported,
                activeSheetId: null,
                selection: null,
            });
        } catch {
            toast.error(
                "Failed to import: file may be invalid or from an incompatible version.",
            );
        }
        e.target.value = "";
    }

    return (
        <header
            className="flex h-12 flex-none items-center justify-between border-b border-border bg-card px-4"
            data-testid="round-header"
        >
            <div className="flex items-center gap-3">
                <Link
                    href="/"
                    className="text-[13px] text-muted-foreground hover:text-foreground"
                    data-testid="back-to-flows"
                >
                    ← Flows
                </Link>
                <span className="text-sm font-semibold text-foreground">
                    {participants}
                </span>
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
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => useRoundStore.getState().setGuideOpen(true)}
                    aria-label="Guide"
                    data-testid="guide-btn"
                >
                    Guide
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => useRoundStore.getState().setInfoOpen(true)}
                    aria-label="Round info"
                    data-testid="info-btn"
                >
                    Info
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                        useRoundStore.getState().setSettingsOpen(true)
                    }
                    aria-label="Settings"
                    data-testid="settings-btn"
                >
                    <Settings className="size-4" />
                </Button>
                <ExportMenu />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportClick}
                    data-testid="import-btn"
                >
                    Import
                </Button>
            </div>
        </header>
    );
}
