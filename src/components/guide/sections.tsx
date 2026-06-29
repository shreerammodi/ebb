import type { ReactNode } from "react";

import type { CommandId } from "@/lib/commands/registry";
import { keyHintFor } from "@/lib/keymap/displayChord";

export type GuideSection = {
    id: string;
    label: string;
    title: string;
    body: ReactNode;
};

/** A key chip. Pass `cmd` for a live keymap binding, or `k` for a literal key. */
function Kbd({ cmd, k }: { cmd?: CommandId; k?: string }) {
    const hint = cmd ? keyHintFor(cmd) : (k ?? null);
    if (!hint) return null;
    return (
        <kbd className="text-foreground inline-flex min-w-[22px] items-center justify-center rounded border border-b-2 border-zinc-200 bg-zinc-50 px-1 py-px font-mono text-[11px] whitespace-nowrap">
            {hint}
        </kbd>
    );
}

/** Small markup sketch of the grid model used in the Anatomy section. */
function GridDiagram() {
    const speeches = ["1NC", "2AC", "2NC", "1AR"];
    return (
        <div className="border-border my-3 overflow-hidden rounded-md border">
            <div className="border-border text-muted-foreground grid grid-cols-4 border-b bg-zinc-50 text-[11px] font-semibold">
                {speeches.map((s) => (
                    <div key={s} className="px-2 py-1">
                        {s}
                    </div>
                ))}
            </div>
            <div className="text-foreground grid grid-cols-4 text-[11px]">
                <div className="px-2 py-1.5">Net Benefit</div>
                <div className="text-muted-foreground px-2 py-1.5">→ answer</div>
                <div className="text-muted-foreground px-2 py-1.5">→ answer</div>
                <div className="px-2 py-1.5" />
                <div className="px-2 py-1.5">Solvency</div>
                <div className="text-muted-foreground px-2 py-1.5">→ answer</div>
                <div className="px-2 py-1.5" />
                <div className="px-2 py-1.5" />
            </div>
        </div>
    );
}

export const GUIDE_SECTIONS: GuideSection[] = [
    {
        id: "welcome",
        label: "Welcome",
        title: "Welcome to Ebb",
        body: (
            <>
                <p>
                    Ebb is a keyboard-first tool for flowing competitive rounds. Everything you type
                    stays on this device. Your flows live in your browser, never on a server, and
                    they work offline.
                </p>
                <p>
                    This guide covers the whole app, from the dashboard to flowing a live round. You
                    can reopen it any time from the Guide button.
                </p>
            </>
        ),
    },
    {
        id: "dashboard",
        label: "Dashboard",
        title: "The dashboard",
        body: (
            <>
                <p>
                    The dashboard lists every flow you have saved. New flow creates one and opens
                    the editor; click any card to reopen a round.
                </p>
                <ul className="ml-4 list-disc space-y-1">
                    <li>A card&rsquo;s menu renames, duplicates, deletes, or shows details.</li>
                    <li>Search finds a flow by team or argument text.</li>
                    <li>Sort reorders the list, and Group by tournament clusters it.</li>
                    <li>Import and Export move flows in and out as files.</li>
                    <li>Trash holds deleted flows until you restore or purge them.</li>
                    <li>
                        The guide opens automatically on first visit, or any time from the Guide
                        button.
                    </li>
                </ul>
            </>
        ),
    },
    {
        id: "anatomy",
        label: "Anatomy of a flow",
        title: "Anatomy of a flow",
        body: (
            <>
                <p>
                    A round is a set of sheets. Each sheet is a grid: columns are speeches in time
                    order, and rows are arguments. You read an argument left to right across the
                    speeches as it gets answered.
                </p>
                <GridDiagram />
                <p>
                    A response sits in the next speech&rsquo;s column on the same row as the
                    argument it answers. Aff and Neg sheets track each side&rsquo;s offense; CX
                    sheets capture cross-examination with Question and Response columns for each
                    period.
                </p>
                <p>
                    The sidebar on the left lists your sheets. Collapse it with{" "}
                    <Kbd cmd="sidebar.toggle" /> to give the grid more room.
                </p>
            </>
        ),
    },
    {
        id: "flowing",
        label: "Flowing a round",
        title: "Flowing a round",
        body: (
            <>
                <p>
                    Use the arrows to navigate to a cell and start typing to flow an argument. Cells
                    appear empty until you type — the node is only created on the first keystroke,
                    so you can cancel with <Kbd k="Esc" /> before committing.
                </p>
                <ul className="ml-4 list-disc space-y-1">
                    <li>
                        <Kbd cmd="node.response" /> opens a response slot in the next speech,
                        answering the current argument. The slot stays blank until you type; press{" "}
                        <Kbd k="Esc" /> to abandon it.
                    </li>
                    <li>
                        <Kbd cmd="node.sibling" /> adds a sibling argument in the same speech, e.g.
                        a second response. Like response, the node is deferred until you type.
                    </li>
                    <li>
                        <Kbd cmd="row.delete" /> removes a row and <Kbd cmd="cell.clear" /> empties
                        a cell.
                    </li>
                    <li>
                        <Kbd cmd="node.deleteSubtree" /> removes an argument and everything
                        answering it.
                    </li>
                    <li>
                        <Kbd cmd="move.grab" /> grabs an argument and its entire subtree (all
                        responses below it are highlighted). Move it with the arrow keys, then{" "}
                        <Kbd cmd="move.commit" /> to drop or <Kbd cmd="move.cancel" /> to cancel.
                    </li>
                    <li>
                        Mark an argument <Kbd cmd="status.toggleConceded" /> conceded or{" "}
                        <Kbd cmd="status.toggleExtended" /> extended,{" "}
                        <Kbd cmd="format.toggleBold" /> for emphasis, and{" "}
                        <Kbd cmd="format.toggleHighlight" /> to highlight it.
                    </li>
                </ul>
            </>
        ),
    },
    {
        id: "navigating",
        label: "Navigating",
        title: "Navigating",
        body: (
            <>
                <ul className="ml-4 list-disc space-y-1">
                    <li>Arrow keys move between cells.</li>
                    <li>
                        <Kbd cmd="nav.jumpUp" /> <Kbd cmd="nav.jumpDown" />{" "}
                        <Kbd cmd="nav.jumpLeft" /> <Kbd cmd="nav.jumpRight" /> leap to the edge of
                        the current block (like in Excel).
                    </li>
                    <li>
                        <Kbd cmd="nav.jumpHome" /> and <Kbd cmd="nav.jumpEnd" /> reach the ends of a
                        row.
                    </li>
                    <li>
                        <Kbd cmd="nav.nextSpeech" /> and <Kbd cmd="nav.prevSpeech" /> move by
                        speech.
                    </li>
                    <li>
                        Switch sheets with <Kbd cmd="sheet.prev" /> and <Kbd cmd="sheet.next" />, or
                        use <Kbd cmd="sheet.quickSwitch" /> to fuzzy find to swap sheets.
                    </li>
                </ul>
            </>
        ),
    },
    {
        id: "info-settings",
        label: "Info & settings",
        title: "Round info and settings",
        body: (
            <>
                <p>
                    The info panel records round metadata: teams, schools, side, judge, result, etc.
                    This is exported with the flow, and also lets you sort and find flows in the
                    dashboard.
                </p>
                <p>
                    Settings is where you change display options and remap keys. Every shortcut
                    shown in this guide reflects your current keymap. You can also pick a flow font;
                    choose between mono fonts (Commit Mono, IBM Plex Mono) and sans-serif fonts (DM
                    Sans, Inter) to match your preference.
                </p>
            </>
        ),
    },
    {
        id: "saving",
        label: "Saving & export",
        title: "Saving, exporting, printing",
        body: (
            <>
                <p>
                    Your work saves automatically as you type, and the save indicator shows the
                    status.
                </p>
                <p>
                    You can export any flow to json, which lets other Ebb users import your flows.
                    Alternatively, you can export to Excel.
                </p>
            </>
        ),
    },
    {
        id: "keys",
        label: "Keyboard",
        title: "Keyboard reference",
        body: (
            <>
                <p>
                    Ebb is built to run from the keyboard. Keybindings use the platform modifier —{" "}
                    <Kbd k="Cmd" /> on macOS, <Kbd k="Ctrl" /> on Windows and Linux, so every
                    shortcut adapts automatically.
                </p>
                <p>
                    Some actions are modal: grab an argument with <Kbd cmd="move.grab" />, move it
                    with the arrow keys, then <Kbd cmd="move.commit" /> to drop it or{" "}
                    <Kbd cmd="move.cancel" /> to abandon the move. While moving, the entire subtree
                    (all descendants) is highlighted so you can see what will move together.
                </p>
                <p>
                    You can collapse the sidebar with <Kbd cmd="sidebar.toggle" /> to give the grid
                    more room, and open it again the same way.
                </p>
                <p>
                    For the complete, always-current list of shortcuts, press{" "}
                    <Kbd cmd="help.open" /> anywhere in the editor.
                </p>
            </>
        ),
    },
];
