"use client";

import { HotTable } from "@handsontable/react-wrapper";
import type { HotTableRef } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import { useEffect, useRef } from "react";

import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

registerAllModules();

/** Policy speech columns, hardcoded for the spike. */
export const SPEECHES = ["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"];

/** rows x speeches sample data; every 7th cell filled so scrolling is visible. */
export function makeSampleData(rows: number): (string | null)[][] {
    return Array.from({ length: rows }, (_, r) =>
        SPEECHES.map((s, c) => ((r * SPEECHES.length + c) % 7 === 0 ? `${s} arg ${r}` : null)),
    );
}

export default function SpikeGrid() {
    const hotRef = useRef<HotTableRef>(null);

    // beforeKeyDown + stopImmediatePropagation cannot suppress key handling
    // in Handsontable 18 (keys route through the ShortcutManager), so the
    // editor context's shortcuts are edited directly instead.
    useEffect(() => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const editorCtx = hot.getShortcutManager().getContext("editor");
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
                data={makeSampleData(200)}
                colHeaders={SPEECHES}
                rowHeaders={true}
                colWidths={280}
                wordWrap={true}
                autoRowSize={true}
                height="100%"
                licenseKey="non-commercial-and-evaluation"
            />
        </div>
    );
}
