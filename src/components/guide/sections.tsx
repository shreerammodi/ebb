import type { ReactNode } from "react";
import { keyHintFor } from "@/lib/keymap/displayChord";
import type { CommandId } from "@/lib/commands/registry";

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
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded border border-b-2 border-zinc-200 bg-zinc-50 px-1 py-px font-mono text-[11px] whitespace-nowrap text-foreground">
      {hint}
    </kbd>
  );
}

/** Small markup sketch of the grid model used in the Anatomy section. */
function GridDiagram() {
  const speeches = ["1AC", "1NC", "2AC", "2NC"];
  return (
    <div className="my-3 overflow-hidden rounded-md border border-border">
      <div className="grid grid-cols-4 border-b border-border bg-zinc-50 text-[11px] font-semibold text-muted-foreground">
        {speeches.map((s) => (
          <div key={s} className="px-2 py-1">
            {s}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 text-[11px] text-foreground">
        <div className="px-2 py-1.5">Framework</div>
        <div className="px-2 py-1.5 text-muted-foreground">→ answer</div>
        <div className="px-2 py-1.5 text-muted-foreground">→ answer</div>
        <div className="px-2 py-1.5" />
        <div className="px-2 py-1.5">Solvency</div>
        <div className="px-2 py-1.5 text-muted-foreground">→ answer</div>
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
          Ebb is a keyboard-first tool for flowing competitive rounds. Everything you type stays on
          this device. Your flows live in your browser, never on a server, and they work offline.
        </p>
        <p>
          This guide covers the whole app, from the dashboard to flowing a live round. You can
          reopen it any time from the Guide button.
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
          The dashboard lists every flow you have saved. New flow creates one and opens the editor;
          click any card to reopen a round.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>A card&rsquo;s menu renames, duplicates, deletes, or shows details.</li>
          <li>Search finds a flow by team or argument text.</li>
          <li>Sort reorders the list, and Group by tournament clusters it.</li>
          <li>Import and Export move flows in and out as files.</li>
          <li>Trash holds deleted flows until you restore or purge them.</li>
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
          A round is a set of sheets. Each sheet is a grid: columns are speeches in time order, and
          rows are arguments. You read an argument left to right across the speeches as it gets
          answered.
        </p>
        <GridDiagram />
        <p>
          A response sits in the next speech&rsquo;s column on the same row as the argument it
          answers. Aff and Neg sheets track each side&rsquo;s offense; CX sheets capture
          cross-examination.
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
          Arrow to a cell and type to flow an argument. The editor keeps the structure tidy as you
          go.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <Kbd cmd="node.sibling" /> adds a sibling argument in the same speech.
          </li>
          <li>
            <Kbd cmd="node.response" /> adds a response in the next speech, answering the current
            argument.
          </li>
          <li>
            <Kbd cmd="row.insertAbove" /> and <Kbd cmd="row.insertBelow" /> add blank rows;{" "}
            <Kbd cmd="row.delete" /> removes a row and <Kbd cmd="cell.clear" /> empties a cell.
          </li>
          <li>
            <Kbd cmd="node.deleteSubtree" /> removes an argument and everything answering it.
          </li>
          <li>
            <Kbd cmd="move.grab" /> grabs an argument to reorganize; drop it with{" "}
            <Kbd cmd="move.commit" />.
          </li>
          <li>
            Mark an argument <Kbd cmd="status.toggleConceded" /> conceded or{" "}
            <Kbd cmd="status.toggleExtended" /> extended, and <Kbd cmd="format.toggleBold" /> for
            emphasis.
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
        <p>
          Arrow keys move between cells. Jump keys leap to the edge of the current block, and
          Home/End reach the ends of a row.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <Kbd cmd="nav.nextSpeech" /> and <Kbd cmd="nav.prevSpeech" /> move by speech.
          </li>
          <li>
            Switch sheets with <Kbd cmd="sheet.prev" /> and <Kbd cmd="sheet.next" />, or{" "}
            <Kbd cmd="sheet.quickSwitch" /> to jump to any sheet by name.
          </li>
          <li>The search palette finds text anywhere in the round.</li>
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
          Info records the teams, schools, side, judge, and result for the round, the same fields
          the dashboard sorts and groups by.
        </p>
        <p>
          Settings is where you change display options and remap keys. Every shortcut shown in this
          guide reflects your current keymap.
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
          Your work saves automatically as you type, and the save indicator shows the status. Undo
          and redo step through changes.
        </p>
        <p>Export writes the round to xlsx or csv, and Print produces a clean printable flow.</p>
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
          Ebb is built to run from the keyboard. Some actions are modal: grab an argument with{" "}
          <Kbd cmd="move.grab" />, move it with the arrow keys, then <Kbd cmd="move.commit" /> to
          drop it or <Kbd cmd="move.cancel" /> to abandon the move.
        </p>
        <p>
          For the complete, always-current list of shortcuts, press <Kbd cmd="help.open" /> anywhere
          in the editor.
        </p>
      </>
    ),
  },
];
