"use client";

import { HotTable } from "@handsontable/react-wrapper";
import type { HotTableRef } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import { useEffect, useRef } from "react";

import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import "./spike.css";

registerAllModules();

export interface SpikeMeta {
    [key: string]: { bold?: boolean; highlight?: boolean };
}

/** Policy speech columns, hardcoded for the spike. */
export const SPEECHES = ["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"];

/** rows x speeches sample data; every 7th cell filled so scrolling is visible. */
export function makeSampleData(rows: number): (string | null)[][] {
    return Array.from({ length: rows }, (_, r) =>
        SPEECHES.map((s, c) => ((r * SPEECHES.length + c) % 7 === 0 ? `${s} arg ${r}` : null)),
    );
}

export default function SpikeGrid({
    onSnapshot,
    initial,
}: {
    onSnapshot?: (data: (string | null)[][], meta: SpikeMeta) => void;
    initial?: { data: (string | null)[][]; meta: SpikeMeta };
}) {
    const hotRef = useRef<HotTableRef>(null);
    // A fresh data array on each render makes the wrapper reload the grid and
    // wipe user edits; the array identity must stay stable across renders.
    const dataRef = useRef<(string | null)[][] | null>(null);
    dataRef.current ??= initial?.data ?? makeSampleData(200);

    const collectSnapshot = () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot || !onSnapshot) return;
        const data = hot.getData() as (string | null)[][];
        const meta: SpikeMeta = {};
        for (let r = 0; r < hot.countRows(); r++) {
            for (let c = 0; c < hot.countCols(); c++) {
                const cls = (hot.getCellMeta(r, c).className ?? "") as string;
                const bold = cls.includes("spike-bold");
                const highlight = cls.includes("spike-highlight");
                if (bold || highlight) meta[`${r},${c}`] = { bold, highlight };
            }
        }
        onSnapshot(data, meta);
    };

    const toggleDecoration = (cls: "spike-bold" | "spike-highlight") => {
        const hot = hotRef.current?.hotInstance;
        const sel = hot?.getSelected()?.[0];
        if (!hot || !sel) return;
        const [r, c] = sel;
        if (r < 0 || c < 0) return;
        const current = ((hot.getCellMeta(r, c).className ?? "") as string)
            .split(" ")
            .filter(Boolean);
        const next = current.includes(cls) ? current.filter((x) => x !== cls) : [...current, cls];
        hot.setCellMeta(r, c, "className", next.join(" "));
        hot.render();
        collectSnapshot();
    };

    // beforeKeyDown + stopImmediatePropagation cannot suppress key handling
    // in Handsontable 18 (keys route through the ShortcutManager), so the
    // editor context's shortcuts are edited directly instead.
    // Saved decorations are cell meta, not data, so they are re-applied on mount.
    useEffect(() => {
        const hot = hotRef.current?.hotInstance;
        if (!hot || !initial?.meta) return;
        for (const [key, m] of Object.entries(initial.meta)) {
            const [r, c] = key.split(",").map(Number);
            const cls = [m.bold ? "spike-bold" : "", m.highlight ? "spike-highlight" : ""]
                .filter(Boolean)
                .join(" ");
            hot.setCellMeta(r, c, "className", cls);
        }
        hot.render();
        // ponytail: mount-only; initial never changes after the load settles
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const editorCtx = hot.getShortcutManager().getContext("editor");
        if (!editorCtx) return;
        // Plain Enter falls through to the textarea, which inserts a newline.
        editorCtx.removeShortcutsByKeys(["enter"]);
        // Alt+Enter commits and lands the selection one row down.
        editorCtx.addShortcut({
            keys: [["alt", "enter"]],
            group: "spike-keys",
            callback: () => {
                hot.getActiveEditor()?.finishEditing(false);
                const sel = hot.getSelectedLast();
                if (sel) hot.selectCell(Math.min(sel[0] + 1, hot.countRows() - 1), sel[1]);
            },
        });
    }, []);

    return (
        <div className="ht-theme-main" style={{ height: "80vh", overflow: "hidden" }}>
            <HotTable
                ref={hotRef}
                data={dataRef.current}
                colHeaders={SPEECHES}
                rowHeaders={true}
                colWidths={280}
                wordWrap={true}
                autoRowSize={true}
                height="100%"
                beforeKeyDown={function (this: unknown, e: KeyboardEvent) {
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        toggleDecoration("spike-bold");
                        return;
                    }
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "h") {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        toggleDecoration("spike-highlight");
                    }
                }}
                // changes is null for loadData/updateSettings passes, which the
                // wrapper re-fires on every render; snapshotting those loops
                // setState -> render -> afterChange forever.
                afterChange={(changes: unknown) => {
                    if (changes) collectSnapshot();
                }}
                licenseKey="non-commercial-and-evaluation"
            />
        </div>
    );
}
