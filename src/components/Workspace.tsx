"use client";

import { useEffect } from "react";

import { useKeymap } from "@/lib/keymap/useKeymap";
import { CX_COLUMNS } from "@/lib/model/cxColumns";
import { useRoundStore } from "@/lib/store/useRoundStore";

import CommandPalette from "./CommandPalette";
import CriticalUpdateModal from "./CriticalUpdateModal";
import FlowCoach from "./FlowCoach";
import FlowGrid from "./FlowGrid";
import GuideDialog from "./guide/GuideDialog";
import InfoPanel from "./InfoPanel";
import KeybindingsCheatsheet from "./KeybindingsCheatsheet";
import PrintView from "./PrintView";
import RoundHeader from "./RoundHeader";
import SearchPalette from "./SearchPalette";
import SettingsPanel from "./SettingsPanel";
import Sidebar from "./Sidebar";
import UpdateChip from "./UpdateChip";
import { UpdateProvider } from "./UpdateProvider";

export default function Workspace() {
    useKeymap();

    const activeSheetId = useRoundStore((s) => s.activeSheetId);

    useEffect(() => {
        const { round, selection } = useRoundStore.getState();
        if (!activeSheetId || !round) return;
        if (selection?.sheetId === activeSheetId) return;

        const activeSheet = round.sheets.find((s) => s.id === activeSheetId);
        const columns = activeSheet?.kind === "cx" ? CX_COLUMNS : round.format.speeches;
        // Land on the topmost-leftmost occupied cell, else the first cell.
        const sheetNodes = round.nodes
            .filter((n) => n.sheetId === activeSheetId)
            .sort((a, b) => {
                if (a.row !== b.row) return a.row - b.row;
                const colA = columns.findIndex((s) => s.id === a.speechId);
                const colB = columns.findIndex((s) => s.id === b.speechId);
                return colA - colB;
            });

        const first = sheetNodes[0];
        useRoundStore.getState().setSelection({
            sheetId: activeSheetId,
            speechId: first ? first.speechId : columns[0].id,
            row: first ? first.row : 0,
        });
    }, [activeSheetId]);

    return (
        <UpdateProvider>
            <div className="flex h-screen flex-col bg-zinc-50" data-testid="workspace">
                <RoundHeader />
                <div className="flex min-h-0 flex-1">
                    <Sidebar />
                    <main
                        className="min-w-0 flex-1 overflow-auto p-4"
                        data-testid="workspace-content"
                    >
                        {activeSheetId ? (
                            <FlowGrid sheetId={activeSheetId} />
                        ) : (
                            <div className="text-muted-foreground p-6 text-[13px]">
                                No sheet selected. Choose one from the sidebar, or add a sheet with{" "}
                                <span className="text-foreground font-medium">+ Aff</span> /{" "}
                                <span className="text-foreground font-medium">+ Neg</span>.
                            </div>
                        )}
                    </main>
                </div>
                <SearchPalette />
                <CommandPalette />
                <SettingsPanel />
                <InfoPanel />
                <KeybindingsCheatsheet />
                <GuideDialog />
                <PrintView />
                <UpdateChip />
                <CriticalUpdateModal />
                <FlowCoach />
            </div>
        </UpdateProvider>
    );
}
