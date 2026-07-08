"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
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
        body: "A sheet is one flow. Aff sheets read blue, neg red, recolor either side under Settings > Display. Add them with the shortcuts below, reorder them in the sidebar, and jump straight to one by its number. Switch speeches from the header to drop your cursor on any speech's top row across every sheet.",
    },
    {
        heading: "Split view",
        body: "Toggle split view to lay two sheets side by side, like reading a DA next to case on paper. Move focus between the panes with the focus-left and focus-right shortcuts; picking a sheet in the sidebar or palette retargets the focused pane.",
    },
    {
        heading: "Marking cells",
        body: "Bold a claim, highlight what matters, or tag a cell as a card (evidence). Select a run of cells and group them to bracket a cluster of responses under one argument. These combine freely and surface in search.",
    },
    {
        heading: "Find anything",
        body: "Search cells to jump to any argument across every sheet. The command palette runs every action by name when a shortcut slips your mind.",
    },
    {
        heading: "Round info",
        body: "Open round info to record the teams, judge, and decision for scouting later. Paste a Tabroom pairing into the box at the top to autofill the sheet; if it already has details, it asks before replacing them.",
    },
    {
        heading: "Writing an RFD",
        body: "Open the RFD drawer to write your decision while scanning the flow. On a > blockquote line, start typing and pick a suggestion to drop the exact wording of any cell straight into your reasoning. Toggle Preview in the drawer header to see it rendered, and turn on vim keybindings for the editor in Settings > Display.",
    },
    {
        heading: "Your data",
        body: "Everything lives in this browser and autosaves as you type. Nothing is sent anywhere, and undo reaches back through your whole history.",
    },
    {
        heading: "Config file",
        body: "On the desktop app your settings mirror to a plain-text config.toml (in $XDG_CONFIG_HOME/ebb, else ~/.config/ebb, or %APPDATA%\\ebb on Windows). Edit it in any editor and changes apply live; changes you make in the app write back to it, and comments you add are kept.",
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
            { commandId: "format.toggleCard" as CommandId },
            { commandId: "format.toggleGroup" as CommandId },
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
            { commandId: "split.toggle" as CommandId },
            { commandId: "split.focusLeft" as CommandId },
            { commandId: "split.focusRight" as CommandId },
            { commandId: "sheet.jump1" as CommandId },
        ],
    },
    {
        label: "App",
        rows: [
            { commandId: "palette.open" as CommandId },
            { commandId: "settings.open" as CommandId },
            { commandId: "info.open" as CommandId },
            { commandId: "rfd.toggle" as CommandId },
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
                                            <Kbd className="min-w-[26px] shrink-0 px-1.5 text-[12px]">
                                                {row.chord}
                                            </Kbd>
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
                                            <div
                                                key={commandId}
                                                className="flex items-center gap-2"
                                            >
                                                <Kbd className="min-w-[26px] shrink-0 px-1.5 text-[12px]">
                                                    {displayChord}
                                                </Kbd>
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
