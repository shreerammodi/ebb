"use client";

import { useRoundStore } from "@/lib/store/useRoundStore";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { prettyChord, buildChordMap } from "@/lib/keymap/displayChord";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const GROUPS = [
    {
        label: "Navigate",
        rows: [
            { commandId: "move.up" as CommandId },
            { commandId: "move.down" as CommandId },
            { commandId: "move.left" as CommandId },
            { commandId: "move.right" as CommandId },
        ],
    },
    {
        label: "Jump",
        rows: [
            { commandId: "nav.jumpUp" as CommandId },
            { commandId: "nav.jumpDown" as CommandId },
            { commandId: "nav.jumpLeft" as CommandId },
            { commandId: "nav.jumpRight" as CommandId },
            { commandId: "nav.jumpHome" as CommandId },
            { commandId: "nav.jumpEnd" as CommandId },
        ],
    },
    {
        label: "Edit",
        rows: [
            { commandId: "node.sibling" as CommandId },
            { commandId: "node.response" as CommandId },
            { commandId: "row.insertAbove" as CommandId },
            { commandId: "row.delete" as CommandId },
            { commandId: "cell.clear" as CommandId },
            { commandId: "node.deleteSubtree" as CommandId },
        ],
    },
    {
        label: "Move",
        rows: [
            { commandId: "move.grab" as CommandId },
            { commandId: "move.commit" as CommandId, moveMode: true },
            { commandId: "move.cancel" as CommandId, moveMode: true },
        ],
    },
    {
        label: "Status",
        rows: [
            { commandId: "status.toggleConceded" as CommandId },
            { commandId: "status.toggleExtended" as CommandId },
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
            { commandId: "settings.open" as CommandId },
            { commandId: "help.open" as CommandId },
        ],
    },
] as const;

export default function KeybindingsCheatsheet() {
    const open = useRoundStore((s) => s.cheatsheetOpen);
    const setCheatsheetOpen = useRoundStore((s) => s.setCheatsheetOpen);

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
                <DialogHeader className="shrink-0 border-b border-border px-[18px] pt-[14px] pb-2.5">
                    <DialogTitle className="text-sm font-semibold text-foreground">
                        Keyboard shortcuts
                    </DialogTitle>
                </DialogHeader>

                <div
                    className="grid gap-4 overflow-y-auto px-[18px] py-3"
                    style={{ gridTemplateColumns: "1fr 1fr" }}
                >
                    {GROUPS.map((group) => (
                        <div key={group.label} className="flex flex-col gap-1">
                            <div className="mb-1 font-mono text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
                                {group.label}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {group.rows.map((row) => {
                                    const { commandId } = row;
                                    const moveMode =
                                        "moveMode" in row
                                            ? row.moveMode
                                            : undefined;
                                    const chord = chordFor[commandId];
                                    const isJumpAnchor =
                                        commandId === "sheet.jump1";
                                    if (!chord && !isJumpAnchor) return null;
                                    const displayChord = isJumpAnchor
                                        ? prettyChord(
                                              chord ?? "Meta+1",
                                          ).replace("1", "1–9")
                                        : prettyChord(chord!);
                                    const label = isJumpAnchor
                                        ? "Jump to sheet 1–9"
                                        : COMMANDS[commandId].label;

                                    return (
                                        <div
                                            key={commandId}
                                            className="flex items-center gap-2"
                                        >
                                            <kbd className="inline-flex min-w-[26px] shrink-0 items-center justify-center rounded border border-b-2 border-zinc-200 bg-zinc-50 px-1.5 py-px font-mono text-[12px] whitespace-nowrap text-foreground">
                                                {displayChord}
                                            </kbd>
                                            <span className="flex items-center gap-1 text-[12px] text-foreground">
                                                {label}
                                                {moveMode && (
                                                    <span className="rounded border border-zinc-200 bg-zinc-50 px-1 text-[10px] leading-4 text-muted-foreground">
                                                        move
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
