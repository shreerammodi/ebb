"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { executeCommand } from "@/lib/commands/commands";
import type { Sheet } from "@/lib/model/types";
import {
    useRoundStore,
    selectSheetsByGroup,
    selectSheetDropCount,
} from "@/lib/store/useRoundStore";
import { cn } from "@/lib/utils";

interface GroupConfig {
    group: "aff" | "neg";
    label: string;
}

const GROUPS: GroupConfig[] = [
    { group: "aff", label: "Aff" },
    { group: "neg", label: "Neg" },
];

const EMPTY_SHEETS: Sheet[] = [];

export default function Sidebar() {
    const sheets = useRoundStore((s) => s.round?.sheets ?? EMPTY_SHEETS);

    const activeSheetId = useRoundStore((s) => s.activeSheetId);
    const setActiveSheet = useRoundStore((s) => s.setActiveSheet);
    const renamingSheetId = useRoundStore((s) => s.renamingSheetId);
    const setRenamingSheet = useRoundStore((s) => s.setRenamingSheet);
    const labelDrops = useRoundStore((s) => s.labelDrops);
    const removeSheet = useRoundStore((s) => s.removeSheet);
    const restoreSheet = useRoundStore((s) => s.restoreSheet);
    const sidebarCollapsed = useRoundStore((s) => s.sidebarCollapsed);
    const setSidebarCollapsed = useRoundStore((s) => s.setSidebarCollapsed);

    if (sheets.length === 0) return null;

    // Deleting a sheet wipes a whole column of a live round, so it must be
    // reversible at the point of action — not only via a keyboard Undo the user
    // may not know about. Mirror the dashboard's soft-delete + Undo toast.
    function deleteSheet(sheetId: string) {
        const removed = removeSheet(sheetId);
        if (!removed) return;
        toast(`Deleted “${removed.sheet.title}”`, {
            action: {
                label: "Undo",
                onClick: () => restoreSheet(removed),
            },
        });
    }

    const cxSheet = sheets.find((s) => s.kind === "cx") ?? null;

    if (sidebarCollapsed) {
        return (
            <nav
                className="no-print border-border bg-card flex h-full w-9 shrink-0 flex-col items-center border-r pt-2"
                aria-label="Sheets"
                data-testid="sidebar"
            >
                <Tip label="Expand sidebar" command="sidebar.toggle" side="right">
                    <button
                        type="button"
                        aria-label="Expand sidebar"
                        onClick={() => setSidebarCollapsed(false)}
                        className="text-muted-foreground hover:text-foreground hover:bg-accent rounded p-1 transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                </Tip>
            </nav>
        );
    }

    return (
        <nav
            className="no-print border-border bg-card flex h-full w-[220px] shrink-0 flex-col border-r"
            aria-label="Sheets"
            data-testid="sidebar"
        >
            <div className="flex shrink-0 items-center gap-1 p-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => executeCommand("sheet.newAff")}
                    data-testid="add-aff"
                >
                    + Aff
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => executeCommand("sheet.newNeg")}
                    data-testid="add-neg"
                >
                    + Neg
                </Button>
                <Tip label="Collapse sidebar" command="sidebar.toggle">
                    <button
                        type="button"
                        aria-label="Collapse sidebar"
                        onClick={() => setSidebarCollapsed(true)}
                        className="text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded p-1 transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                </Tip>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {cxSheet && (
                    <div className="mb-3">
                        <div
                            data-testid="cx-section-label"
                            className="text-muted-foreground px-2 pb-1 font-mono text-[9px] font-bold tracking-widest uppercase"
                        >
                            CX
                        </div>
                        <button
                            type="button"
                            onClick={() => setActiveSheet(cxSheet.id)}
                            aria-current={cxSheet.id === activeSheetId ? "true" : undefined}
                            data-testid="cx-sheet-row"
                            className={cn(
                                "flex w-full items-center rounded-md border px-2 py-1.5 text-left text-[13px] text-foreground transition-colors",
                                cxSheet.id === activeSheetId
                                    ? "border-border bg-accent font-semibold text-foreground"
                                    : "border-transparent hover:bg-accent/50",
                            )}
                        >
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {cxSheet.title}
                            </span>
                        </button>
                    </div>
                )}
                {GROUPS.map(({ group, label }) => {
                    const groupSheets = sheets
                        .filter((s) => s.group === group)
                        .sort((a, b) => a.order - b.order)
                        .filter((s) => s.kind !== "cx");
                    return (
                        <div key={group} className="mb-3">
                            <div className="text-muted-foreground px-2 pb-1 font-mono text-[9px] font-bold tracking-widest uppercase">
                                {label}
                            </div>
                            {groupSheets.length === 0 ? (
                                <div className="text-muted-foreground px-2 py-1 text-xs">
                                    No sheets
                                </div>
                            ) : (
                                groupSheets.map((sheet) => (
                                    <SheetRow
                                        key={sheet.id}
                                        sheet={sheet}
                                        active={sheet.id === activeSheetId}
                                        onSelect={() => setActiveSheet(sheet.id)}
                                        isRenaming={sheet.id === renamingSheetId}
                                        onStartRename={() => setRenamingSheet(sheet.id)}
                                        onDelete={() => deleteSheet(sheet.id)}
                                    />
                                ))
                            )}
                        </div>
                    );
                })}
            </div>
        </nav>
    );
}

interface SheetRowProps {
    sheet: Sheet;
    active: boolean;
    onSelect: () => void;
    isRenaming: boolean;
    onStartRename: () => void;
    onDelete: () => void;
}

function SheetRow({ sheet, active, onSelect, isRenaming, onStartRename, onDelete }: SheetRowProps) {
    const renameSheet = useRoundStore((s) => s.renameSheet);
    const setRenamingSheet = useRoundStore((s) => s.setRenamingSheet);
    const labelDrops = useRoundStore((s) => s.labelDrops);
    const dropCount = useRoundStore((s) =>
        labelDrops ? selectSheetDropCount(s.round, sheet.id) : 0,
    );
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState(sheet.title);

    const titleRef = useRef<HTMLSpanElement>(null);
    const [titleTruncated, setTitleTruncated] = useState(false);

    useEffect(() => {
        const el = titleRef.current;
        if (!el) return;
        setTitleTruncated(el.scrollWidth > el.clientWidth);
    }, [sheet.title]);

    useEffect(() => {
        if (isRenaming) {
            setValue(sheet.title);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [isRenaming, sheet.title]);

    function commit() {
        renameSheet(sheet.id, value.trim() || sheet.title);
        setRenamingSheet(null);
    }

    function cancel() {
        setRenamingSheet(null);
    }

    if (isRenaming) {
        return (
            <div
                className={cn(
                    "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5",
                    active ? "border-border bg-accent font-semibold" : "border-transparent",
                )}
            >
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.stopPropagation();
                            commit();
                        }
                        if (e.key === "Escape") {
                            e.stopPropagation();
                            cancel();
                        }
                    }}
                    onBlur={commit}
                    className="text-foreground outline-aff flex-1 rounded-sm border-none bg-transparent px-0.5 font-[inherit] text-[13px] outline outline-1"
                    data-testid={`rename-input-${sheet.id}`}
                />
            </div>
        );
    }

    return (
        <div className="group flex items-center">
            <div
                role="button"
                tabIndex={0}
                onClick={onSelect}
                onDoubleClick={onStartRename}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect();
                    }
                }}
                aria-current={active ? "true" : undefined}
                data-testid={`sheet-${sheet.id}`}
                className={cn(
                    "flex w-full flex-1 cursor-pointer items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-left text-[13px] text-foreground transition-colors",
                    active
                        ? "border-border bg-accent font-semibold text-foreground"
                        : "border-transparent hover:bg-accent/50",
                )}
            >
                {titleTruncated ? (
                    <Tip label={sheet.title}>
                        <span ref={titleRef} className="overflow-hidden text-ellipsis whitespace-nowrap">
                            {sheet.title}
                        </span>
                    </Tip>
                ) : (
                    <span ref={titleRef} className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {sheet.title}
                    </span>
                )}
                {dropCount > 0 && (
                    <span className="badge-drop" data-testid={`drop-badge-${sheet.id}`}>
                        {dropCount}
                    </span>
                )}
            </div>
            <Tip label="Delete sheet">
                <button
                    type="button"
                    aria-label="Delete sheet"
                    data-testid={`delete-sheet-${sheet.id}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="text-muted-foreground hover:text-destructive cursor-pointer rounded px-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                >
                    ×
                </button>
            </Tip>
        </div>
    );
}
