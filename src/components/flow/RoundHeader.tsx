"use client";

import { Gear, House, Question } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { segmentedTabClass } from "@/components/ui/segmented-tab";
import { Tip } from "@/components/ui/tooltip";
import { showWorkspaceView } from "@/lib/commands/commands";
import { sideLabels } from "@/lib/format/events";
import { teamCode } from "@/lib/model/teamCode";
import { useFlowStore, type WorkspaceView } from "@/lib/store/useFlowStore";

import ExportMenu from "./ExportMenu";
import SaveStatus from "./SaveStatus";
import SpeechSwitcher from "./SpeechSwitcher";
import ZoomControl from "./ZoomControl";

const VIEWS: { view: WorkspaceView; label: string }[] = [
    { view: "flow", label: "Flow" },
    { view: "decision", label: "Decision" },
];

/** Flow / Decision: the grid, or the last rebuttals and cross-ex beside the RFD. */
function ViewTabs() {
    const current = useFlowStore((s) => s.workspaceView);
    return (
        <Tip label="Switch view" command="view.decision">
            <div
                role="tablist"
                aria-label="Workspace view"
                className="border-border ribbon-tight:flex hidden flex-none overflow-hidden rounded-md border text-[12px]"
            >
                {VIEWS.map(({ view, label }) => (
                    <button
                        key={view}
                        type="button"
                        role="tab"
                        aria-selected={current === view}
                        data-testid={`view-tab-${view}`}
                        onClick={() => showWorkspaceView(view)}
                        className={segmentedTabClass(current === view)}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </Tip>
    );
}

export default function RoundHeader() {
    const scouting = useFlowStore((s) => s.round?.scouting);
    const sides = sideLabels(useFlowStore((s) => s.round?.event));

    if (!scouting) return null;

    const affCode =
        teamCode(scouting.affSchool ?? "", scouting.aff.first, scouting.aff.second) ||
        sides.aff.label;
    const negCode =
        teamCode(scouting.negSchool ?? "", scouting.neg.first, scouting.neg.second) ||
        sides.neg.label;
    const participants = `${affCode} vs ${negCode}`;

    return (
        <header
            className="border-border bg-card ribbon:gap-4 ribbon:px-4 flex h-12 flex-none items-center gap-2 border-b px-3"
            data-testid="round-header"
        >
            <div className="ribbon:gap-3 flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
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

            <div className="no-print ribbon:gap-2 flex flex-none items-center gap-1">
                <ViewTabs />
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
                <Tip label="Keyboard shortcuts" command="help.open">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useFlowStore.getState().setCheatsheetOpen(true)}
                        aria-label="Keyboard shortcuts"
                        data-testid="guide-btn"
                    >
                        <Question className="size-4.5" />
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
                        <Gear className="size-4.5 rotate-[22.5deg]" />
                    </Button>
                </Tip>
                <ExportMenu />
            </div>
        </header>
    );
}
