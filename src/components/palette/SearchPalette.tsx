"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { executeCommand } from "@/lib/commands/commands";
import { keyHintFor } from "@/lib/keymap/displayChord";
import { searchCells } from "@/lib/search/cellSearch";
import { searchCommands } from "@/lib/search/commandSearch";
import { useFlowStore } from "@/lib/store/useFlowStore";

/**
 * The command/search palette, VSCode-style: fuzzy-search every filled cell in
 * the flow, or prefix the query with ">" to fuzzy-search commands instead.
 * Enter jumps the grid cursor to a cell, or runs the selected command.
 */
export default function SearchPalette() {
    const open = useFlowStore((s) => s.quickSwitcherOpen);
    if (!open) return null;
    return <SearchPaletteInner />;
}

/** Bolds the fuzzy-matched characters within a row's text. */
function Highlighted({ text, positions }: { text: string; positions: number[] }) {
    if (positions.length === 0) return <>{text}</>;
    const hit = new Set(positions);
    return (
        <>
            {Array.from(text, (ch, i) =>
                hit.has(i) ? (
                    <span key={i} className="text-foreground font-semibold">
                        {ch}
                    </span>
                ) : (
                    ch
                ),
            )}
        </>
    );
}

/** A palette row, unified across the cell and command modes. */
type Row =
    | {
          kind: "cell";
          id: string;
          text: string;
          positions: number[];
          meta: string;
          run: () => void;
      }
    | {
          kind: "command";
          id: string;
          text: string;
          positions: number[];
          hint: string | null;
          run: () => void;
      };

function SearchPaletteInner() {
    const open = useFlowStore((s) => s.quickSwitcherOpen);
    const seed = useFlowStore((s) => s.paletteSeed);
    const round = useFlowStore((s) => s.round);
    const revealCell = useFlowStore((s) => s.revealCell);
    const setOpen = useFlowStore((s) => s.setQuickSwitcherOpen);

    const [query, setQuery] = useState(seed);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Re-seed when the palette is reopened in a different mode without first
    // closing (e.g. Cmd+Shift+P while the search palette is already open).
    useEffect(() => {
        setQuery(seed);
        setSelectedIndex(0);
    }, [seed]);

    const isCommandMode = query.startsWith(">");

    const rows = useMemo<Row[]>(() => {
        if (isCommandMode) {
            return searchCommands(query.slice(1)).map((c) => ({
                kind: "command",
                id: c.id,
                text: c.label,
                positions: c.positions,
                hint: keyHintFor(c.id),
                run: () => executeCommand(c.id),
            }));
        }
        if (!round) return [];
        return searchCells(round, query).map((hit) => ({
            kind: "cell",
            id: `${hit.sheetId}-${hit.row}-${hit.col}`,
            text: hit.text,
            positions: hit.positions,
            meta: hit.colName ? `${hit.sheetTitle} ${hit.colName}` : hit.sheetTitle,
            run: () => revealCell(hit.sheetId, hit.row, hit.col),
        }));
    }, [isCommandMode, query, round, revealCell]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Keep the highlighted row visible when arrowing past the viewport edge.
    useEffect(() => {
        if (!open) return;
        document.getElementById(`sp-row-${selectedIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }, [open, selectedIndex, rows]);

    if (!open) return null;

    function select(row: Row) {
        // Run first, then close: a self-listed command (e.g. "Command palette")
        // reopens the palette, and closing afterwards leaves it dismissed.
        row.run();
        setOpen(false);
    }

    function onKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            return;
        }
        const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
        const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");
        if (down) {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
            return;
        }
        if (up) {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const row = rows[selectedIndex];
            if (row) select(row);
        }
    }

    const activeId = rows[selectedIndex] ? `sp-row-${selectedIndex}` : undefined;
    const label = isCommandMode ? "Run command" : "Search cells";

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) setOpen(false);
            }}
        >
            {/* Hosted on the shared Dialog primitive for a real focus trap +
                scroll lock (Tab can't walk into the grid behind it), but
                top-anchored and chromeless to keep the command-palette feel. */}
            <DialogContent
                showCloseButton={false}
                aria-label={label}
                data-testid="search-palette"
                onKeyDown={onKeyDown}
                onOpenAutoFocus={(e) => {
                    // Own focus so the caret lands past the ">" seed instead of
                    // selecting it (Radix's default autofocus selects the input).
                    e.preventDefault();
                    const el = inputRef.current;
                    el?.focus();
                    el?.setSelectionRange(seed.length, seed.length);
                }}
                className="top-[12vh] w-full max-w-[520px] translate-y-0 gap-0 overflow-hidden p-0"
            >
                <DialogTitle className="sr-only">{label}</DialogTitle>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                        isCommandMode ? "Run a command…" : "Search cells, or > for commands…"
                    }
                    className="border-border bg-card text-foreground box-border w-full border-b px-3.5 py-3 text-[14px] focus:outline-none"
                    data-testid="search-palette-input"
                    aria-label={label}
                    role="combobox"
                    aria-expanded
                    aria-controls="search-palette-list"
                    aria-activedescendant={activeId}
                />
                <div
                    id="search-palette-list"
                    role="listbox"
                    aria-label="Results"
                    className="max-h-[55vh] overflow-y-auto p-1.5"
                >
                    {rows.length === 0 ? (
                        <div className="text-muted-foreground px-2.5 py-2 text-[13px]">
                            {isCommandMode ? "No commands" : "No results"}
                        </div>
                    ) : (
                        <ul className="m-0 list-none p-0">
                            {rows.map((row, i) => (
                                <li key={row.id} role="presentation">
                                    <button
                                        type="button"
                                        id={`sp-row-${i}`}
                                        role="option"
                                        aria-selected={i === selectedIndex}
                                        className={`text-muted-foreground block w-full cursor-pointer rounded-md border-none px-2.5 py-2 text-left text-[13px] ${
                                            i === selectedIndex
                                                ? "bg-accent"
                                                : "hover:bg-accent/50 bg-transparent"
                                        }`}
                                        onClick={() => select(row)}
                                        data-testid={`sp-row-${i}`}
                                    >
                                        {row.kind === "command" ? (
                                            <span className="flex items-center justify-between gap-3">
                                                <span className="text-foreground truncate">
                                                    <Highlighted
                                                        text={row.text}
                                                        positions={row.positions}
                                                    />
                                                </span>
                                                {row.hint && (
                                                    <kbd className="shrink-0 text-[11px]">
                                                        {row.hint}
                                                    </kbd>
                                                )}
                                            </span>
                                        ) : (
                                            <>
                                                <span className="text-foreground line-clamp-2 block">
                                                    <Highlighted
                                                        text={row.text}
                                                        positions={row.positions}
                                                    />
                                                </span>
                                                <span className="mt-0.5 block text-[11px] opacity-70">
                                                    {row.meta}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
