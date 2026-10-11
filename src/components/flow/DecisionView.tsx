"use client";

/**
 * DecisionView - the round laid out for writing a decision: the cross-ex
 * sheet and every flow sheet's last rebuttals side by side, beside the RFD.
 *
 * Read-only and rendered from FlowSheet data rather than through
 * Handsontable, so any number of sheets fit on screen at once; flowing
 * happens in the grid, one chord or one tab away.
 */

import { Plus, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { Tip } from "@/components/ui/tooltip";
import { metaToClassName } from "@/lib/grid/codec";
import type { FlowSheet } from "@/lib/model/flow";
import { decisionPanels, type DecisionPanel } from "@/lib/rfd/decisionView";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { cn } from "@/lib/utils";

import RfdEditor, { RfdModeTabs, type RfdMode } from "./RfdEditor";

/** Column widths in px: a cross-ex sheet carries a pair per period, so its columns run narrower. */
const FLOW_COL_WIDTH = 200;
const CX_COL_WIDTH = 170;

const RFD_MIN_WIDTH = 280;

/** Ink for a sheet's title: the cross-ex sheet holds both sides, so it stays neutral. */
function titleInk(sheet: FlowSheet): string {
    if (sheet.kind === "cx") return "text-foreground";
    return sheet.group === "neg" ? "text-neg" : "text-aff";
}

function Panel({ panel }: { panel: DecisionPanel }) {
    const setDecisionPanel = useFlowStore((s) => s.setDecisionPanel);
    const { sheet, columns, rows } = panel;
    const width = columns.length * (sheet.kind === "cx" ? CX_COL_WIDTH : FLOW_COL_WIDTH);

    return (
        <section
            aria-label={sheet.title}
            data-testid={`decision-panel-${sheet.id}`}
            className="border-border flex h-full flex-none flex-col border-r"
            style={{ width }}
        >
            <div className="border-border flex h-9 flex-none items-center justify-between gap-2 border-b px-3">
                <h2
                    className={cn(
                        "truncate text-[12px] font-semibold tracking-wider uppercase",
                        titleInk(sheet),
                    )}
                >
                    {sheet.title}
                </h2>
                <Tip label="Hide sheet">
                    <button
                        type="button"
                        aria-label={`Hide ${sheet.title}`}
                        data-testid={`decision-hide-${sheet.id}`}
                        onClick={() => setDecisionPanel(sheet.id, false)}
                        className="text-muted-foreground hover:text-foreground flex-none rounded transition-colors focus-visible:outline-2"
                    >
                        <X className="size-3.5" />
                    </button>
                </Tip>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="decision-flow font-flow w-full table-fixed border-collapse">
                    <thead className="bg-background sticky top-0">
                        <tr>
                            {columns.map(({ col, index }) => (
                                <th
                                    key={index}
                                    scope="col"
                                    className={cn(
                                        "border-border border-b border-l px-2 py-1.5 text-center text-[11px] font-bold first:border-l-0",
                                        col.side === "aff" ? "text-aff" : "text-neg",
                                    )}
                                >
                                    {col.group && (
                                        <div className="text-muted-foreground truncate font-semibold">
                                            {col.group}
                                        </div>
                                    )}
                                    {col.short}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ row, cells }) => (
                            <tr key={row}>
                                {cells.map((text, i) => {
                                    const { col, index } = columns[i];
                                    return (
                                        <td
                                            key={index}
                                            className={cn(
                                                "border-border border-l px-2 py-1 align-top text-[13px] leading-snug break-words whitespace-pre-wrap first:border-l-0",
                                                col.side === "aff" ? "text-aff" : "text-neg",
                                                metaToClassName(sheet.meta[`${row},${index}`]),
                                            )}
                                        >
                                            {text}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <p className="text-muted-foreground px-3 py-2 text-[12px]">
                        Nothing written here yet.
                    </p>
                )}
            </div>
        </section>
    );
}

function HiddenSheets({ hidden }: { hidden: DecisionPanel[] }) {
    const setDecisionPanel = useFlowStore((s) => s.setDecisionPanel);
    if (hidden.length === 0) return null;

    return (
        <div
            data-testid="decision-hidden"
            className="border-border flex flex-none flex-wrap items-center gap-1.5 border-b px-3 py-1.5"
        >
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                Hidden
            </span>
            {hidden.map(({ sheet }) => (
                <button
                    key={sheet.id}
                    type="button"
                    aria-label={`Show ${sheet.title}`}
                    data-testid={`decision-show-${sheet.id}`}
                    onClick={() => setDecisionPanel(sheet.id, true)}
                    className={cn(
                        "border-border hover:bg-accent/50 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] transition-colors focus-visible:outline-2",
                        titleInk(sheet),
                    )}
                >
                    <Plus className="size-3" />
                    {sheet.title}
                </button>
            ))}
        </div>
    );
}

function RfdPanel() {
    // Roughly a third of the window; dragging the left edge resizes.
    const [width, setWidth] = useState(() =>
        Math.max(RFD_MIN_WIDTH, Math.round(window.innerWidth * 0.3)),
    );
    // Transient per-mount, like the drawer's: the view always opens in edit mode.
    const [mode, setMode] = useState<RfdMode>("edit");

    function startResize(e: React.PointerEvent) {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = width;
        const max = window.innerWidth * 0.7;
        function onMove(ev: PointerEvent) {
            // Dragging left (smaller clientX) grows the panel.
            setWidth(Math.max(RFD_MIN_WIDTH, Math.min(max, startWidth + (startX - ev.clientX))));
        }
        function onUp() {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }

    return (
        <section
            aria-label="Reason for decision"
            data-testid="decision-rfd"
            className="border-border bg-card relative flex flex-none flex-col border-l"
            style={{ width }}
        >
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize reason for decision"
                onPointerDown={startResize}
                className="hover:bg-accent absolute inset-y-0 left-0 w-1 cursor-col-resize"
            />
            <div className="border-border flex h-9 flex-none items-center justify-between gap-2 border-b px-3.5">
                <span className="text-foreground text-[12px] font-semibold tracking-wider uppercase">
                    Reason for decision
                </span>
                <RfdModeTabs mode={mode} onChange={setMode} />
            </div>
            <RfdEditor mode={mode} />
        </section>
    );
}

export default function DecisionView() {
    const round = useFlowStore((s) => s.round);
    const overrides = useFlowStore((s) => s.decisionPanels);
    const panels = useMemo(
        () => (round ? decisionPanels(round, overrides) : { shown: [], hidden: [] }),
        [round, overrides],
    );

    return (
        <div data-testid="decision-view" className="no-print flex min-h-0 min-w-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
                <HiddenSheets hidden={panels.hidden} />
                {panels.shown.length > 0 ? (
                    <div className="flex min-h-0 flex-1 overflow-x-auto">
                        {panels.shown.map((panel) => (
                            <Panel key={panel.sheet.id} panel={panel} />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground p-6 text-[13px]">
                        No sheets shown. A sheet appears here once its last rebuttals or cross-ex
                        have text in them
                        {panels.hidden.length > 0 &&
                            "; show one from the list above to lay it out now"}
                        .
                    </p>
                )}
            </div>
            <RfdPanel />
        </div>
    );
}
