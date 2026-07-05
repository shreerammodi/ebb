"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { prettyChord, buildChordMap } from "@/lib/keymap/displayChord";
import { useFlowStore } from "@/lib/store/useFlowStore";

const BASICS: { heading: string; body: string }[] = [
    {
        heading: "Flowing",
        body: "Each column is a speech. Type an argument in a cell; Enter commits and drops down so responses stack beneath it, Tab commits and moves right to answer across into the next speech.",
    },
    {
        heading: "Sheets and sides",
        body: "A sheet is one flow. Aff sheets read blue, neg red. Add them with the shortcuts below, reorder them in the sidebar, and jump straight to one by its number.",
    },
    {
        heading: "Marking cells",
        body: "Bold a claim, highlight what matters, or tag a cell as a card (evidence). The three combine freely and surface in search.",
    },
    {
        heading: "Find anything",
        body: "Search cells to jump to any argument across every sheet. The command palette runs every action by name when a shortcut slips your mind.",
    },
    {
        heading: "Round info",
        body: "Open round info to record the teams, judge, and decision for scouting later.",
    },
    {
        heading: "Your data",
        body: "Everything lives in this browser and autosaves as you type. Nothing is sent anywhere, and undo reaches back through your whole history.",
    },
];

/** Grid-native gestures owned by Handsontable; fixed, not rebindable. */
const FIXED_GROUPS: { label: string; rows: { chord: string; label: string }[] }[] = [
    {
        label: "Editing (fixed)",
        rows: [
            { chord: "Enter", label: "Commit and move down" },
            { chord: "Alt+Enter", label: "New line in cell" },
            { chord: "Tab", label: "Commit and move right" },
            { chord: "Esc", label: "Cancel edit" },
            { chord: "F2", label: "Edit cell" },
            { chord: "Delete", label: "Clear cell" },
        ],
    },
    {
        label: "Navigate (fixed)",
        rows: [
            { chord: "Arrows", label: "Move selection" },
            { chord: "Ctrl+Arrows", label: "Jump to data edge" },
        ],
    },
];

const GROUPS = [
    {
        label: "Format",
        rows: [
            { commandId: "format.toggleBold" as CommandId },
            { commandId: "format.toggleHighlight" as CommandId },
        ],
    },
    {
        label: "Edit",
        rows: [
            { commandId: "edit.undo" as CommandId },
            { commandId: "edit.redo" as CommandId },
            { commandId: "cell.insert" as CommandId },
            { commandId: "row.insertAbove" as CommandId },
            { commandId: "row.delete" as CommandId },
        ],
    },
    {
        label: "Sheets",
        rows: [
            { commandId: "sheet.prev" as CommandId },
            { commandId: "sheet.next" as CommandId },
            { commandId: "sheet.quickSwitch" as CommandId },
            { commandId: "sheet.newAff" as CommandId },
            { commandId: "sheet.newNeg" as CommandId },
            { commandId: "sheet.rename" as CommandId },
            { commandId: "sheet.jump1" as CommandId },
        ],
    },
    {
        label: "App",
        rows: [
            { commandId: "palette.open" as CommandId },
            { commandId: "settings.open" as CommandId },
            { commandId: "info.open" as CommandId },
            { commandId: "sidebar.toggle" as CommandId },
            { commandId: "help.open" as CommandId },
        ],
    },
] as const;

export default function KeybindingsCheatsheet() {
    const open = useFlowStore((s) => s.cheatsheetOpen);
    const setCheatsheetOpen = useFlowStore((s) => s.setCheatsheetOpen);

    function close() {
        setCheatsheetOpen(false);
    }

    const chordFor = buildChordMap();

    return (
        <Dialog
            open={open}
            onOpenChange={(val) => {
                if (!val) close();
            }}
        >
            <DialogContent
                className="flex max-h-[80vh] max-w-[480px] flex-col overflow-hidden p-0"
                data-testid="cheatsheet-panel"
                onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "?") {
                        e.preventDefault();
                        e.stopPropagation();
                        close();
                    }
                }}
            >
                <DialogHeader className="border-border shrink-0 border-b px-[18px] pt-[14px] pb-2.5">
                    <DialogTitle className="text-foreground text-sm font-semibold">
                        Guide
                    </DialogTitle>
                </DialogHeader>

                <div className="overflow-y-auto">
                    <div className="border-border flex flex-col gap-2.5 border-b px-[18px] py-3">
                        {BASICS.map((item) => (
                            <div key={item.heading} className="flex flex-col gap-0.5">
                                <div className="text-muted-foreground font-mono text-[9px] font-bold tracking-widest uppercase">
                                    {item.heading}
                                </div>
                                <p className="text-foreground text-[12px] leading-snug">
                                    {item.body}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div
                        className="grid gap-4 px-[18px] py-3"
                        style={{ gridTemplateColumns: "1fr 1fr" }}
                    >
                        {FIXED_GROUPS.map((group) => (
                        <div key={group.label} className="flex flex-col gap-1">
                            <div className="text-muted-foreground mb-1 font-mono text-[9px] font-bold tracking-widest uppercase">
                                {group.label}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {group.rows.map((row) => (
                                    <div key={row.label} className="flex items-center gap-2">
                                        <kbd className="text-foreground border-border bg-muted inline-flex min-w-[26px] shrink-0 items-center justify-center rounded border border-b-2 px-1.5 py-px font-mono text-[12px] whitespace-nowrap">
                                            {row.chord}
                                        </kbd>
                                        <span className="text-foreground text-[12px]">
                                            {row.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {GROUPS.map((group) => (
                        <div key={group.label} className="flex flex-col gap-1">
                            <div className="text-muted-foreground mb-1 font-mono text-[9px] font-bold tracking-widest uppercase">
                                {group.label}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {group.rows.map((row) => {
                                    const { commandId } = row;
                                    const chord = chordFor[commandId];
                                    const isJumpAnchor = commandId === "sheet.jump1";
                                    if (!chord && !isJumpAnchor) return null;
                                    const displayChord = isJumpAnchor
                                        ? prettyChord(chord ?? "Meta+1").replace("1", "1-9")
                                        : prettyChord(chord!);
                                    const label = isJumpAnchor
                                        ? "Jump to sheet 1-9"
                                        : COMMANDS[commandId].label;

                                    return (
                                        <div key={commandId} className="flex items-center gap-2">
                                            <kbd className="text-foreground border-border bg-muted inline-flex min-w-[26px] shrink-0 items-center justify-center rounded border border-b-2 px-1.5 py-px font-mono text-[12px] whitespace-nowrap">
                                                {displayChord}
                                            </kbd>
                                            <span className="text-foreground text-[12px]">
                                                {label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    </div>
                </div>

                <div className="border-border text-muted-foreground shrink-0 border-t px-[18px] py-2 text-[11px]">
                    Every action here also lives in the command palette. Press ? to close.
                </div>
            </DialogContent>
        </Dialog>
    );
}
