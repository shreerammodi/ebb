"use client";

import { CaretDown, CaretUp, X } from "@phosphor-icons/react";
import { LazyMotion, Reorder, m } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { toast } from "sonner";

import InviteChip from "@/components/collab/InviteChip";
import SessionChip from "@/components/collab/SessionChip";
import ShareButton from "@/components/collab/ShareButton";
import { loadFeatures } from "@/components/MotionRoot";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { sideLabels } from "@/lib/format/events";
import { focusActiveHot } from "@/lib/grid/hotInstance";
import { compareSheets, dropSheetRange, sheetRangeIds, type FlowSheet } from "@/lib/model/flow";
import { focusedSheetId, useFlowStore } from "@/lib/store/useFlowStore";
import { cn } from "@/lib/utils";

const EMPTY_SHEETS: FlowSheet[] = [];
/** Pointer travel, in px, past which a press was a drag rather than a click. */
const DRAG_SLOP = 4;

/**
 * The sheet list as a ribbon along the grid's top or bottom edge rather than a
 * column beside it.
 *
 * It is a card sized to its contents, so the stretch of empty layout a short
 * round leaves after its last tab is simply not drawn. At the top, a single
 * pane also lets it stand in for the pane's title bar - the active tab is the
 * title - so that placement costs the grid no height at all.
 */
export default function SheetRibbon({ position }: { position: "top" | "bottom" }) {
    const sheets = useFlowStore((s) => s.round?.sheets ?? EMPTY_SHEETS);
    const sides = sideLabels(useFlowStore((s) => s.round?.event));

    // Highlight follows the focused pane's sheet, so in split view the marker
    // tracks Tab 1/Tab 2 focus rather than always sitting on pane 1.
    const focusedId = useFlowStore((s) => focusedSheetId(s));
    const setActiveSheet = useFlowStore((s) => s.setActiveSheet);
    const renamingSheetId = useFlowStore((s) => s.renamingSheetId);
    const setRenamingSheet = useFlowStore((s) => s.setRenamingSheet);
    const setSidebarCollapsed = useFlowStore((s) => s.setSidebarCollapsed);
    const removeSheet = useFlowStore((s) => s.removeSheet);
    const restoreSheet = useFlowStore((s) => s.restoreSheet);
    const reorderSheets = useFlowStore((s) => s.reorderSheets);
    const renameSheet = useFlowStore((s) => s.renameSheet);
    const sheetRange = useFlowStore((s) => s.sheetRange);
    const setSheetRange = useFlowStore((s) => s.setSheetRange);
    const addSheets = useFlowStore((s) => s.addSheets);
    // The drag in flight: the tab the pointer picked up, the block that came
    // with it, and the ordering motion last proposed. A ref, not state - the
    // gesture reads what it wrote and nothing renders on it.
    const drag = useRef<{ id: string; block: string[]; landing: string[] } | null>(null);
    // Bulk count: empty (or junk) means one sheet, so the buttons stay single-add
    // by default and only fan out when the user types a number.
    const [bulkCount, setBulkCount] = useState("");

    if (sheets.length === 0) return null;

    const cxSheet = sheets.find((s) => s.kind === "cx") ?? null;
    const flowSheets = sheets.filter((s) => s.kind !== "cx").sort(compareSheets);
    // Derived every render rather than stored: a sheet deleted out from under
    // a range resolves to no selection instead of a stale id in a list.
    const selectedIds = sheetRange
        ? sheetRangeIds(flowSheets, sheetRange.anchor, sheetRange.head)
        : [];
    const selected = new Set(selectedIds);

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
            action: { label: "Undo", onClick: () => restoreSheet(removed) },
        });
    }

    /**
     * A plain click moves the cursor, which collapses the range. A shifted one
     * only paints: extending across nine sheets must fire no sheet switch, or
     * the grid scrolls away from the speech being flowed.
     */
    function selectSheet(sheetId: string, extend: boolean) {
        if (!extend) {
            setActiveSheet(sheetId);
            return;
        }
        const anchor = sheetRange?.anchor ?? focusedId;
        if (anchor == null) return;
        setSheetRange({ anchor, head: sheetId });
    }

    /** Records the tab the pointer picked up, and the block that comes with it. */
    function handleGrab(sheetId: string) {
        const block = selected.has(sheetId) && selectedIds.length > 1 ? selectedIds : [];
        drag.current = { id: sheetId, block, landing: [] };
    }

    /**
     * Motion proposes a new horizontal order on every frame. Every proposal is
     * committed as it comes, which is the contract Reorder.Group is built on.
     * The block the pointer picked up gathers at the grabbed tab on release.
     */
    function handleReorder(nextIds: string[]) {
        const gesture = drag.current;
        if (gesture) gesture.landing = nextIds;
        // A drag that began outside the range ends it; one that began inside
        // keeps it, so the block it named still has two edges to gather on.
        if (sheetRange && !gesture?.block.length) setSheetRange(null);
        reorderSheets(nextIds);
    }

    /** Lands a dragged block where its grabbed tab was released. */
    function handleDrop() {
        const gesture = drag.current;
        drag.current = null;
        if (!gesture || gesture.block.length === 0 || gesture.landing.length === 0) return;
        reorderSheets(dropSheetRange(gesture.landing, gesture.block, gesture.id));
    }

    function commitRename(sheetId: string, title: string) {
        renameSheet(sheetId, title);
        setRenamingSheet(null);
        focusActiveHot();
    }

    return (
        <div className="no-print flex h-8 shrink-0 items-center px-1" data-testid="sheet-ribbon">
            {/* The width is the content's: adding a sheet grows the rail,
                deleting one cuts the empty end away, and layout animates the
                edge between the two. */}
            <m.nav
                layout
                aria-label="Sheets"
                className="border-border bg-card flex h-[30px] max-w-full min-w-0 items-center gap-0.5 rounded-md border px-1 shadow-sm"
            >
                {/* One segmented control rather than three boxes: the count is
                    a modifier on either add, so it sits between them. */}
                <div className="border-input flex h-6 shrink-0 items-center overflow-hidden rounded-md border text-xs">
                    <button
                        type="button"
                        className="text-aff hover:bg-accent h-full px-2 font-medium transition-colors"
                        onClick={() => addGroup("aff")}
                        data-testid="add-aff"
                    >
                        + {sides.aff.label}
                    </button>
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
                        className="border-input text-foreground placeholder:text-muted-foreground focus:bg-accent h-full w-7 [appearance:textfield] border-x bg-transparent text-center outline-none focus:placeholder-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                        type="button"
                        className="text-neg hover:bg-accent h-full px-2 font-medium transition-colors"
                        onClick={() => addGroup("neg")}
                        data-testid="add-neg"
                    >
                        + {sides.neg.label}
                    </button>
                </div>

                <span aria-hidden className="bg-border mx-0.5 h-4 w-px shrink-0" />

                <div className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                    {cxSheet && (
                        <SheetChip
                            sheet={cxSheet}
                            side="aff"
                            active={cxSheet.id === focusedId}
                            selected={false}
                            isRenaming={cxSheet.id === renamingSheetId}
                            onSelect={(extend) => selectSheet(cxSheet.id, extend)}
                            onStartRename={() => setRenamingSheet(cxSheet.id)}
                            onCommit={(title) => commitRename(cxSheet.id, title)}
                            onCancel={() => setRenamingSheet(null)}
                        />
                    )}
                    <LazyMotion features={loadFeatures}>
                        <Reorder.Group
                            as="div"
                            axis="x"
                            values={flowSheets.map((s) => s.id)}
                            onReorder={handleReorder}
                            className="flex items-center gap-0.5"
                        >
                            {flowSheets.map((sheet) => (
                                <SheetTab
                                    key={sheet.id}
                                    sheet={sheet}
                                    side={sheet.group}
                                    active={sheet.id === focusedId}
                                    selected={selected.has(sheet.id)}
                                    isRenaming={sheet.id === renamingSheetId}
                                    onSelect={(extend) => selectSheet(sheet.id, extend)}
                                    onGrab={() => handleGrab(sheet.id)}
                                    onDrop={handleDrop}
                                    onStartRename={() => setRenamingSheet(sheet.id)}
                                    onCommit={(title) => commitRename(sheet.id, title)}
                                    onCancel={() => setRenamingSheet(null)}
                                    onDelete={() => deleteSheet(sheet.id)}
                                />
                            ))}
                        </Reorder.Group>
                    </LazyMotion>
                </div>

                <span aria-hidden className="bg-border mx-0.5 h-4 w-px shrink-0" />
                <div className="flex shrink-0 items-center gap-0.5">
                    <InviteChip />
                    <SessionChip />
                    <ShareButton />
                    <Tip
                        label="Hide sheet list"
                        command="sidebar.toggle"
                        side={position === "top" ? "bottom" : "top"}
                    >
                        <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            aria-label="Hide sheet list"
                            onClick={() => setSidebarCollapsed(true)}
                            className="text-muted-foreground w-6 px-0"
                            data-testid="collapse-sheet-ribbon"
                        >
                            {position === "top" ? <CaretUp /> : <CaretDown />}
                        </Button>
                    </Tip>
                </div>
            </m.nav>
        </div>
    );
}

function SheetTab(props: ChipProps) {
    return (
        <Reorder.Item
            as="div"
            value={props.sheet.id}
            onDragStart={props.onGrab}
            onDragEnd={props.onDrop}
            className="flex shrink-0 items-center"
        >
            <SheetChip {...props} />
        </Reorder.Item>
    );
}

interface ChipProps {
    sheet: FlowSheet;
    side: "aff" | "neg";
    active: boolean;
    /** Inside the sidebar's range, which the active tab may also be. */
    selected: boolean;
    isRenaming: boolean;
    /** `extend` is the click's shift state: paint the range, do not move focus. */
    onSelect: (extend: boolean) => void;
    onGrab?: () => void;
    onDrop?: () => void;
    onStartRename: () => void;
    onCommit: (title: string) => void;
    onCancel: () => void;
    /** Absent for a sheet the list never offers to delete, such as CX. */
    onDelete?: () => void;
}

function SheetChip({
    sheet,
    side,
    active,
    selected,
    isRenaming,
    onSelect,
    onStartRename,
    onCommit,
    onCancel,
    onDelete,
}: ChipProps) {
    const [value, setValue] = useState(sheet.title);
    const chipRef = useRef<HTMLButtonElement>(null);
    const titleRef = useRef<HTMLSpanElement>(null);
    const [titleTruncated, setTitleTruncated] = useState(false);

    useEffect(() => {
        const el = titleRef.current;
        if (!el) return;
        setTitleTruncated(el.scrollWidth > el.clientWidth);
    }, [sheet.title, active]);
    // Where the pointer went down, so a click that merely ends a drag can be
    // told from one that asks for a sheet.
    const pressedAt = useRef<{ x: number; y: number } | null>(null);

    // A sheet added or selected off the end of a long round scrolls itself
    // into view; in a single pane the tab is the only title the layout has.
    useEffect(() => {
        if (active) {
            chipRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
            });
        }
    }, [active]);

    function press(event: PointerEvent<HTMLButtonElement>) {
        pressedAt.current = { x: event.clientX, y: event.clientY };
    }

    function click(event: MouseEvent<HTMLButtonElement>) {
        // A drag ends in a click on the tab the pointer captured. That is the
        // browser finishing the gesture, not a debater asking for a sheet.
        const from = pressedAt.current;
        if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_SLOP) {
            return;
        }
        onSelect(event.shiftKey);
    }

    if (isRenaming) {
        // A plain input while renaming: keeping it a Reorder.Item wraps it in a
        // motion element that swallows the first keystroke. Dragging is moot
        // mid-rename, so the one non-draggable chip costs nothing.
        return (
            <input
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.stopPropagation();
                        onCommit(value.trim() || sheet.title);
                    }
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        onCancel();
                    }
                }}
                onBlur={() => onCommit(value.trim() || sheet.title)}
                data-editing-field
                aria-label={`Rename ${sheet.title}`}
                className="border-ring bg-card text-foreground h-6 w-28 rounded-md border px-2 text-xs outline-none"
                data-testid={`rename-input-${sheet.id}`}
            />
        );
    }

    return (
        <div className="group relative flex shrink-0 items-center">
            <button
                ref={chipRef}
                type="button"
                onPointerDown={press}
                onClick={click}
                onDoubleClick={onStartRename}
                aria-current={active ? "true" : undefined}
                data-testid={`sheet-${sheet.id}`}
                data-selected={selected ? "true" : undefined}
                className={cn(
                    // Every state shares one weight and one box, so switching
                    // sheets never changes a tab's width and the row holds still.
                    "flex h-6 max-w-44 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                    // The active tab keeps the heavier treatment inside a
                    // range, so the anchor stays legible in the block rather
                    // than dissolving into it.
                    active
                        ? "bg-accent text-foreground ring-border ring-1 ring-inset"
                        : selected
                          ? "bg-accent/60 text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
            >
                <span
                    aria-hidden
                    className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        side === "aff" ? "bg-aff" : "bg-neg",
                    )}
                />
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
            </button>
            {onDelete && (
                <Tip label="Delete sheet">
                    <button
                        type="button"
                        aria-label="Delete sheet"
                        data-testid={`delete-sheet-${sheet.id}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        // Overlaid on the tab's end rather than inserted beside
                        // it, so hovering across the row reflows nothing.
                        className="text-muted-foreground hover:text-destructive bg-accent absolute top-1/2 right-1 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                        <X size={10} weight="bold" />
                    </button>
                </Tip>
            )}
        </div>
    );
}
