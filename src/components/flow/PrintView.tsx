"use client";

/**
 * PrintView - renders all sheets as static read-only tables for printing.
 *
 * Rendered from FlowSheet data, never from the Handsontable widget: the
 * widget's DOM is virtualized and only contains the visible rows. Shown in
 * the DOM alongside the workspace so window.print() captures it; the
 * workspace hides via .no-print, this shows via .print-only.
 */

import { trimGrid } from "@/lib/grid/codec";
import { columnsForFlowSheet } from "@/lib/grid/flowColumns";
import { sortedSheets } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

export default function PrintView() {
    const round = useFlowStore((s) => s.round);

    if (!round) return null;

    return (
        <div className="print-only print-flow" data-testid="print-view">
            {sortedSheets(round).map((sheet) => {
                const cols = columnsForFlowSheet(sheet);
                const rows = trimGrid(sheet.data);
                return (
                    <section key={sheet.id} className="print-sheet">
                        <h2 data-testid={`print-sheet-title-${sheet.id}`}>{sheet.title}</h2>
                        <table>
                            <thead>
                                <tr>
                                    {cols.map((c, i) => (
                                        <th key={i}>{c.group ? `${c.group} ${c.name}` : c.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, r) => (
                                    <tr key={r}>
                                        {cols.map((_, c) => {
                                            const m = sheet.meta[`${r},${c}`];
                                            return (
                                                <td
                                                    key={c}
                                                    className={[
                                                        m?.bold ? "flow-bold" : "",
                                                        m?.highlight ? "flow-highlight" : "",
                                                        m?.group ? "flow-group" : "",
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                >
                                                    {row[c] ?? ""}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                );
            })}
        </div>
    );
}
