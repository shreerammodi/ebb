"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type React from "react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { executeCommand } from "@/lib/commands/commands";
import type { FlowSheet } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { cn } from "@/lib/utils";

const EMPTY_SHEETS: FlowSheet[] = [];

export default function Sidebar() {
    const sheets = useFlowStore((s) => s.round?.sheets ?? EMPTY_SHEETS);

    const activeSheetId = useFlowStore((s) => s.activeSheetId);
    const setActiveSheet = useFlowStore((s) => s.setActiveSheet);
    const renamingSheetId = useFlowStore((s) => s.renamingSheetId);
    const setRenamingSheet = useFlowStore((s) => s.setRenamingSheet);
    const removeSheet = useFlowStore((s) => s.removeSheet);
    const restoreSheet = useFlowStore((s) => s.restoreSheet);
    const sidebarCollapsed = useFlowStore((s) => s.sidebarCollapsed);
    const setSidebarCollapsed = useFlowStore((s) => s.setSidebarCollapsed);
    const reorderSheets = useFlowStore((s) => s.reorderSheets);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

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
                        <CaretRight weight="bold" size={16} />
                    </button>
                </Tip>
            </nav>
        );
    }

    const flowSheets = sheets.filter((s) => s.kind !== "cx").sort((a, b) => a.order - b.order);

    function commitDrop() {
        if (dragId == null || dropIndex == null) {
            setDragId(null);
            setDropIndex(null);
            return;
        }
        const ids = flowSheets.map((s) => s.id);
        const from = ids.indexOf(dragId);
        if (from !== -1) {
            ids.splice(from, 1);
            // Adjust the target index when removing an earlier element shifts it left.
            const to = from < dropIndex ? dropIndex - 1 : dropIndex;
            ids.splice(to, 0, dragId);
            reorderSheets(ids);
        }
        setDragId(null);
        setDropIndex(null);
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
                        <CaretLeft weight="bold" size={16} />
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
                <div>
                    <div
                        data-testid="sheets-section-label"
                        className="text-muted-foreground px-2 pb-1 font-mono text-[9px] font-bold tracking-widest uppercase"
                    >
                        Sheets
                    </div>
                    {flowSheets.length === 0 ? (
                        <div className="text-muted-foreground px-2 py-1 text-xs">No sheets</div>
                    ) : (
                        flowSheets.map((sheet, i) => (
                            <div key={sheet.id}>
                                {dropIndex === i && <DropLine />}
                                <SheetRow
                                    sheet={sheet}
                                    active={sheet.id === activeSheetId}
                                    onSelect={() => setActiveSheet(sheet.id)}
                                    isRenaming={sheet.id === renamingSheetId}
                                    onStartRename={() => setRenamingSheet(sheet.id)}
                                    onDelete={() => deleteSheet(sheet.id)}
                                    dragging={dragId === sheet.id}
                                    onDragStartRow={() => setDragId(sheet.id)}
                                    onDragOverRow={(e) => {
                                        e.preventDefault();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const after = e.clientY - rect.top > rect.height / 2;
                                        setDropIndex(after ? i + 1 : i);
                                    }}
                                    onDropRow={(e) => {
                                        e.preventDefault();
                                        commitDrop();
                                    }}
                                    onDragEndRow={() => {
                                        setDragId(null);
                                        setDropIndex(null);
                                    }}
                                />
                                {i === flowSheets.length - 1 && dropIndex === i + 1 && <DropLine />}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </nav>
    );
}

function DropLine() {
    return (
        <div className="bg-foreground/50 mx-2 my-0.5 h-0.5 rounded-full" data-testid="drop-line" />
    );
}

interface SheetRowProps {
    sheet: FlowSheet;
    active: boolean;
    onSelect: () => void;
    isRenaming: boolean;
    onStartRename: () => void;
    onDelete: () => void;
    dragging: boolean;
    onDragStartRow: () => void;
    onDragOverRow: (e: React.DragEvent<HTMLDivElement>) => void;
    onDropRow: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragEndRow: () => void;
}

function SheetRow({
    sheet,
    active,
    onSelect,
    isRenaming,
    onStartRename,
    onDelete,
    dragging,
    onDragStartRow,
    onDragOverRow,
    onDropRow,
    onDragEndRow,
}: SheetRowProps) {
    const renameSheet = useFlowStore((s) => s.renameSheet);
    const setRenamingSheet = useFlowStore((s) => s.setRenamingSheet);
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
        <div
            className={cn("group flex items-center", dragging && "opacity-50")}
            draggable={!isRenaming}
            onDragStart={onDragStartRow}
            onDragOver={onDragOverRow}
            onDrop={onDropRow}
            onDragEnd={onDragEndRow}
        >
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
                <span
                    aria-hidden
                    data-testid={`sheet-marker-${sheet.id}`}
                    className={cn(
                        "h-4 w-0.5 shrink-0 rounded-full",
                        sheet.group === "aff" ? "bg-aff" : "bg-neg",
                    )}
                />
                <span className="sr-only">{sheet.group === "aff" ? "Aff" : "Neg"}</span>
                {titleTruncated ? (
                    <Tip label={sheet.title}>
                        <span
                            ref={titleRef}
                            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                        >
                            {sheet.title}
                        </span>
                    </Tip>
                ) : (
                    <span
                        ref={titleRef}
                        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                    >
                        {sheet.title}
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
