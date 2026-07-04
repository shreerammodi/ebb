"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { searchCells, type CellHit } from "@/lib/search/cellSearch";
import { useFlowStore } from "@/lib/store/useFlowStore";

/** Fuzzy search over every filled cell in the flow; Enter jumps the grid cursor there. */
export default function SearchPalette() {
    const open = useFlowStore((s) => s.quickSwitcherOpen);
    if (!open) return null;
    return <SearchPaletteInner />;
}

/** Bolds the fuzzy-matched characters within a cell's text. */
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

function SearchPaletteInner() {
    const open = useFlowStore((s) => s.quickSwitcherOpen);
    const round = useFlowStore((s) => s.round);
    const revealCell = useFlowStore((s) => s.revealCell);
    const setOpen = useFlowStore((s) => s.setQuickSwitcherOpen);

    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setQuery("");
            setSelectedIndex(0);
            inputRef.current?.focus();
        }
    }, [open]);

    const rows = useMemo<CellHit[]>(() => {
        if (!round) return [];
        return searchCells(round, query);
    }, [round, query]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Keep the highlighted row visible when arrowing past the viewport edge.
    useEffect(() => {
        if (!open) return;
        document.getElementById(`sp-cell-${selectedIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }, [open, selectedIndex, rows]);

    if (!open) return null;

    function select(hit: CellHit) {
        revealCell(hit.sheetId, hit.row, hit.col);
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

    const activeId = rows[selectedIndex] ? `sp-cell-${selectedIndex}` : undefined;

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
                aria-label="Search cells"
                data-testid="search-palette"
                onKeyDown={onKeyDown}
                className="top-[12vh] w-full max-w-[520px] translate-y-0 gap-0 overflow-hidden p-0"
            >
                <DialogTitle className="sr-only">Search cells</DialogTitle>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search cells..."
                    className="border-border bg-card text-foreground box-border w-full border-b px-3.5 py-3 text-[14px] focus:outline-none"
                    data-testid="search-palette-input"
                    aria-label="Search cells"
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
                            No results
                        </div>
                    ) : (
                        <ul className="m-0 list-none p-0">
                            {rows.map((hit, i) => (
                                <li
                                    key={`${hit.sheetId}-${hit.row}-${hit.col}`}
                                    role="presentation"
                                >
                                    <button
                                        type="button"
                                        id={`sp-cell-${i}`}
                                        role="option"
                                        aria-selected={i === selectedIndex}
                                        className={`text-muted-foreground block w-full cursor-pointer rounded-md border-none px-2.5 py-2 text-left text-[13px] ${
                                            i === selectedIndex
                                                ? "bg-accent"
                                                : "hover:bg-accent/50 bg-transparent"
                                        }`}
                                        onClick={() => select(hit)}
                                        data-testid={`sp-cell-${i}`}
                                    >
                                        <span className="text-foreground line-clamp-2 block">
                                            <Highlighted
                                                text={hit.text}
                                                positions={hit.positions}
                                            />
                                        </span>
                                        <span className="mt-0.5 block text-[11px]">
                                            {hit.sheetTitle}
                                            {hit.colName ? (
                                                <span className="opacity-70"> {hit.colName}</span>
                                            ) : null}
                                        </span>
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
