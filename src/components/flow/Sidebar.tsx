"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Reorder } from "motion/react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import type { FlowSheet } from "@/lib/model/flow";
import { focusedSheetId, useFlowStore } from "@/lib/store/useFlowStore";
import { cn } from "@/lib/utils";

const EMPTY_SHEETS: FlowSheet[] = [];

export default function Sidebar() {
    const sheets = useFlowStore((s) => s.round?.sheets ?? EMPTY_SHEETS);

    // Highlight follows the focused pane's sheet, so in split view the marker
    // tracks Tab 1/Tab 2 focus rather than always sitting on pane 1.
    const focusedId = useFlowStore((s) => focusedSheetId(s));
    const setActiveSheet = useFlowStore((s) => s.setActiveSheet);
    const renamingSheetId = useFlowStore((s) => s.renamingSheetId);
    const setRenamingSheet = useFlowStore((s) => s.setRenamingSheet);
    const removeSheet = useFlowStore((s) => s.removeSheet);
    const restoreSheet = useFlowStore((s) => s.restoreSheet);
    const sidebarCollapsed = useFlowStore((s) => s.sidebarCollapsed);
    const setSidebarCollapsed = useFlowStore((s) => s.setSidebarCollapsed);
    const reorderSheets = useFlowStore((s) => s.reorderSheets);
    const addSheets = useFlowStore((s) => s.addSheets);
    // Bulk count: empty (or junk) means one sheet, so the buttons stay single-add
    // by default and only fan out when the user types a number.
    const [bulkCount, setBulkCount] = useState("");

    if (sheets.length === 0) return null;

    function addGroup(group: "aff" | "neg") {
        const n = Math.max(1, Math.floor(Number(bulkCount)) || 1);
        addSheets(Array.from({ length: n }, () => ({ group })));
    }

    // Deleting a sheet wipes a whole column of a live round, so it must be
    // reversible at the point of action - not only via a keyboard Undo the user
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

    const flowSheets = sheets.filter((s) => s.kind !== "cx").sort((a, b) => a.order - b.order);

    return (
        <nav
            className="no-print border-border bg-card flex h-full w-[220px] shrink-0 flex-col border-r"
            aria-label="Sheets"
            data-testid="sidebar"
        >
            <div className="flex shrink-0 items-center gap-1 p-2">
                <Tip label="Add sheet" command="sheet.newAff">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-aff text-aff dark:border-aff flex-1"
                        onClick={() => addGroup("aff")}
                        data-testid="add-aff"
                    >
                        + Aff
                    </Button>
                </Tip>
                <Tip label="Bulk add sheets">
                    <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={bulkCount}
                        onChange={(e) => setBulkCount(e.target.value)}
                        placeholder="1"
                        aria-label="Bulk add sheets"
                        data-testid="bulk-add-count"
                        data-editing-field
                        className="border-input text-foreground h-8 w-11 shrink-0 [appearance:textfield] rounded-md border bg-transparent px-1 text-center text-[13px] outline-none focus:placeholder-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                </Tip>
                <Tip label="Add sheet" command="sheet.newNeg">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-neg text-neg dark:border-neg flex-1"
                        onClick={() => addGroup("neg")}
                        data-testid="add-neg"
                    >
                        + Neg
                    </Button>
                </Tip>
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
                            aria-current={cxSheet.id === focusedId ? "true" : undefined}
                            data-testid="cx-sheet-row"
                            className={cn(
                                "flex w-full items-center rounded-md border px-2 py-1.5 text-left text-[13px] text-foreground transition-colors",
                                cxSheet.id === focusedId
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
                <div
                    data-testid="sheets-section-label"
                    className="text-muted-foreground px-2 pb-1 font-mono text-[9px] font-bold tracking-widest uppercase"
                >
                    Sheets
                </div>
                {flowSheets.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-1 text-xs">No sheets</div>
                ) : (
                    <Reorder.Group
                        as="div"
                        axis="y"
                        values={flowSheets.map((s) => s.id)}
                        onReorder={reorderSheets}
                    >
                        {flowSheets.map((sheet) => (
                            <SheetRow
                                key={sheet.id}
                                sheet={sheet}
                                active={sheet.id === focusedId}
                                onSelect={() => setActiveSheet(sheet.id)}
                                isRenaming={sheet.id === renamingSheetId}
                                onStartRename={() => setRenamingSheet(sheet.id)}
                                onDelete={() => deleteSheet(sheet.id)}
                            />
                        ))}
                    </Reorder.Group>
                )}
            </div>
        </nav>
    );
}

interface SheetRowProps {
    sheet: FlowSheet;
    active: boolean;
    onSelect: () => void;
    isRenaming: boolean;
    onStartRename: () => void;
    onDelete: () => void;
}

function SheetRow({ sheet, active, onSelect, isRenaming, onStartRename, onDelete }: SheetRowProps) {
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
        // A plain row while renaming: keeping it a Reorder.Item wraps the input in
        // a motion element that swallows the first keystroke. Dragging is moot mid-
        // rename, so the one non-draggable row costs nothing.
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
                    className="text-foreground outline-aff flex-1 rounded-md border-none bg-transparent px-0.5 font-[inherit] text-[13px] outline outline-1"
                    data-testid={`rename-input-${sheet.id}`}
                />
            </div>
        );
    }

    // relative so the dragged row's auto z-index lifts it above its neighbors.
    return (
        <Reorder.Item as="div" value={sheet.id} className="group relative flex items-center">
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
        </Reorder.Item>
    );
}
