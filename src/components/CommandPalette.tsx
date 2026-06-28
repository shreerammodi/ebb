"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { executeCommand } from "@/lib/commands/commands";
import { COMMANDS, type CommandId } from "@/lib/commands/registry";
import { keyHintFor } from "@/lib/keymap/displayChord";
import { fuzzySearch } from "@/lib/search/fuzzy";
import { useRoundStore } from "@/lib/store/useRoundStore";

import { Highlighted } from "./Highlighted";

/** A flat, keyboard-navigable command row. */
interface Row {
    id: CommandId;
    label: string;
    hint: string | null;
    ranges: number[];
}

/** Registry commands in declaration order, with resolved key hints. */
const ALL_COMMANDS = Object.values(COMMANDS).map((c) => ({
    id: c.id,
    label: c.label,
}));

export default function CommandPalette() {
    const open = useRoundStore((s) => s.commandPaletteOpen);
    if (!open) return null;
    return <CommandPaletteInner />;
}

function CommandPaletteInner() {
    const setOpen = useRoundStore((s) => s.setCommandPaletteOpen);

    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
    }, []);

    // Key hints read the live keymap; recompute once per mount.
    const labelHaystack = useMemo(() => ALL_COMMANDS.map((c) => c.label), []);

    const rows = useMemo<Row[]>(() => {
        const q = query.trim();
        if (!q) {
            return ALL_COMMANDS.map((c) => ({
                id: c.id,
                label: c.label,
                hint: keyHintFor(c.id),
                ranges: [],
            }));
        }
        const res = fuzzySearch(labelHaystack, q);
        return res.order.map((idx, i) => {
            const c = ALL_COMMANDS[idx];
            return {
                id: c.id,
                label: c.label,
                hint: keyHintFor(c.id),
                ranges: res.ranges[i],
            };
        });
    }, [query, labelHaystack]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Keep the highlighted row visible when arrowing past the viewport edge.
    useEffect(() => {
        const row = rows[selectedIndex];
        if (!row) return;
        document.getElementById(`cp-${row.id}`)?.scrollIntoView?.({ block: "nearest" });
    }, [selectedIndex, rows]);

    function select(row: Row) {
        setOpen(false);
        executeCommand(row.id);
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

    const activeRow = rows[selectedIndex];
    const activeId = activeRow ? `cp-${activeRow.id}` : undefined;

    return (
        <Dialog
            open
            onOpenChange={(o) => {
                if (!o) setOpen(false);
            }}
        >
            {/* Same chromeless, top-anchored shell as SearchPalette: a real focus
                trap + scroll lock with a command-palette feel. */}
            <DialogContent
                showCloseButton={false}
                aria-label="Run command"
                data-testid="command-palette"
                onKeyDown={onKeyDown}
                className="top-[12vh] w-full max-w-[520px] translate-y-0 gap-0 overflow-hidden p-0"
            >
                <DialogTitle className="sr-only">Run command</DialogTitle>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Run a command…"
                    className="border-border bg-card text-foreground box-border w-full border-b px-3.5 py-3 text-[14px] focus:outline-none"
                    data-testid="command-palette-input"
                    aria-label="Run command"
                    role="combobox"
                    aria-expanded
                    aria-controls="command-palette-list"
                    aria-activedescendant={activeId}
                />
                <div
                    id="command-palette-list"
                    role="listbox"
                    aria-label="Commands"
                    className="max-h-[55vh] overflow-y-auto p-1.5"
                >
                    {rows.length === 0 ? (
                        <div className="text-muted-foreground px-2.5 py-2 text-[13px]">
                            No commands
                        </div>
                    ) : (
                        <ul className="m-0 list-none p-0">
                            {rows.map((row, i) => (
                                <li key={row.id} role="presentation">
                                    <button
                                        type="button"
                                        id={`cp-${row.id}`}
                                        role="option"
                                        aria-selected={i === selectedIndex}
                                        onClick={() => select(row)}
                                        data-testid={`cp-${row.id}`}
                                        className={`text-foreground flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-none px-2.5 py-2 text-left text-[13px] ${
                                            i === selectedIndex
                                                ? "bg-accent"
                                                : "hover:bg-accent/50 bg-transparent"
                                        }`}
                                    >
                                        <span className="truncate">
                                            <Highlighted text={row.label} ranges={row.ranges} />
                                        </span>
                                        {row.hint && (
                                            <kbd className="text-muted-foreground shrink-0 text-[11px]">
                                                {row.hint}
                                            </kbd>
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
