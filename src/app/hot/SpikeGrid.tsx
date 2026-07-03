"use client";

import { HotTable } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";

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
    return (
        <div className="ht-theme-main" style={{ height: "80vh", overflow: "hidden" }}>
            <HotTable
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
