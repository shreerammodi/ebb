"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { sortedSheets, type FlowSheet } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

/**
 * Sheet quick-switcher. Full-text search over flow content returns with the
 * search phase; until then this palette filters sheet titles only.
 */
export default function SearchPalette() {
    const open = useFlowStore((s) => s.quickSwitcherOpen);
    if (!open) return null;
    return <SearchPaletteInner />;
}

function SearchPaletteInner() {
    const open = useFlowStore((s) => s.quickSwitcherOpen);
    const round = useFlowStore((s) => s.round);
    const setActiveSheet = useFlowStore((s) => s.setActiveSheet);
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

    const rows = useMemo<FlowSheet[]>(() => {
        if (!round) return [];
        const sheets = sortedSheets(round);
        const q = query.trim().toLowerCase();
        if (!q) return sheets;
        return sheets.filter((s) => s.title.toLowerCase().includes(q));
    }, [round, query]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Keep the highlighted row visible when arrowing past the viewport edge.
    useEffect(() => {
        if (!open) return;
        const row = rows[selectedIndex];
        if (!row) return;
        document.getElementById(`sp-sheet-${row.id}`)?.scrollIntoView?.({ block: "nearest" });
    }, [open, selectedIndex, rows]);

    if (!open) return null;

    function select(sheet: FlowSheet) {
        setActiveSheet(sheet.id);
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

    const activeId = rows[selectedIndex] ? `sp-sheet-${rows[selectedIndex].id}` : undefined;

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
                aria-label="Switch sheet"
                data-testid="search-palette"
                onKeyDown={onKeyDown}
                className="top-[12vh] w-full max-w-[520px] translate-y-0 gap-0 overflow-hidden p-0"
            >
                <DialogTitle className="sr-only">Switch sheet</DialogTitle>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Switch sheet... (text search coming back soon)"
                    className="border-border bg-card text-foreground box-border w-full border-b px-3.5 py-3 text-[14px] focus:outline-none"
                    data-testid="search-palette-input"
                    aria-label="Switch sheet"
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
                            {rows.map((sheet, i) => (
                                <li key={sheet.id} role="presentation">
                                    <button
                                        type="button"
                                        id={`sp-sheet-${sheet.id}`}
                                        role="option"
                                        aria-selected={i === selectedIndex}
                                        className={`text-foreground block w-full cursor-pointer rounded-md border-none px-2.5 py-2 text-left text-[13px] ${
                                            i === selectedIndex
                                                ? "bg-accent"
                                                : "hover:bg-accent/50 bg-transparent"
                                        }`}
                                        onClick={() => select(sheet)}
                                        data-testid={`sp-sheet-${sheet.id}`}
                                    >
                                        {sheet.title}
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
