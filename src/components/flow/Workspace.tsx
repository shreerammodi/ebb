"use client";

import dynamic from "next/dynamic";

import KeybindingsCheatsheet from "@/components/palette/KeybindingsCheatsheet";
import SearchPalette from "@/components/palette/SearchPalette";
import SettingsPanel from "@/components/settings/SettingsPanel";
import CriticalUpdateModal from "@/components/update/CriticalUpdateModal";
import UpdateChip from "@/components/update/UpdateChip";
import { UpdateProvider } from "@/components/update/UpdateProvider";
import { useKeymap } from "@/lib/keymap/useKeymap";
import { useFlowStore } from "@/lib/store/useFlowStore";

import InfoPanel from "./InfoPanel";
import PrintView from "./PrintView";
import RfdDrawer from "./RfdDrawer";
import RoundHeader from "./RoundHeader";
import Sidebar from "./Sidebar";

// Handsontable touches window at import time; keep it out of prerendering.
const HotGrid = dynamic(() => import("./HotGrid"), { ssr: false });

export default function Workspace() {
    useKeymap();

    const activeSheetId = useFlowStore((s) => s.activeSheetId);
    const rfdOpen = useFlowStore((s) => s.rfdOpen);
    const roundId = useFlowStore((s) => s.round?.id);

    return (
        <UpdateProvider>
            <div className="bg-background flex h-screen flex-col" data-testid="workspace">
                <RoundHeader />
                <div className="flex min-h-0 flex-1">
                    <Sidebar />
                    <main
                        // isolate: trap Handsontable's frozen-header clone layers (z-index up
                        // to ~1060) in their own stacking context so they can't punch through
                        // dialog/dropdown/sheet overlays (z-50) that dim the rest of the screen.
                        className="no-print isolate min-w-0 flex-1 overflow-hidden"
                        data-testid="workspace-content"
                    >
                        {activeSheetId ? (
                            <HotGrid />
                        ) : (
                            <div className="text-muted-foreground p-6 text-[13px]">
                                No sheet selected. Choose one from the sidebar, or add a sheet with{" "}
                                <span className="text-foreground font-medium">+ Aff</span> /{" "}
                                <span className="text-foreground font-medium">+ Neg</span>.
                            </div>
                        )}
                    </main>
                </div>
                {rfdOpen && roundId && <RfdDrawer key={roundId} />}
                <SearchPalette />
                <SettingsPanel />
                <InfoPanel />
                <KeybindingsCheatsheet />
                <PrintView />
                <UpdateChip />
                <CriticalUpdateModal />
            </div>
        </UpdateProvider>
    );
}
