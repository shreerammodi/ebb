/**
 * Excel exporter. Renders each sheet of the round into an offscreen
 * Handsontable instance and exports them all through the ExportFile plugin's
 * multi-sheet xlsx engine (ExcelJS), then appends the Info and RFD
 * worksheets with ExcelJS directly. Cell styling (bold, highlight, card)
 * transfers from the same CSS classes the on-screen grid renders. Runs
 * without the visible grid, so dashboard export works identically.
 */

import Handsontable from "handsontable";
import { registerAllModules } from "handsontable/registry";

import { metaToClassName, padGrid } from "@/lib/grid/codec";
import { columnsForFlowSheet, headerSettings } from "@/lib/grid/flowColumns";
import { sortedSheets, type FlowRound } from "@/lib/model/flow";

import { exportFilename, saveBlob } from "./download";
import { applyInfoWorksheet, maybeAddRfdWorksheet } from "./infoSheet";
import { safeSheetName } from "./sheetNames";

registerAllModules();

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadXlsx(round: FlowRound): Promise<void> {
    const { default: ExcelJS } = await import("exceljs");

    // Offscreen but laid out: Handsontable will not render inside display:none.
    const container = document.createElement("div");
    container.className = "ht-theme-main";
    container.style.cssText = "position:absolute;left:-10000px;top:0;width:1400px;";
    document.body.appendChild(container);
    const instances: Handsontable[] = [];
    try {
        const used = new Set<string>(["Info", "RFD"].map((n) => n.toLowerCase()));
        const sheets = sortedSheets(round).map((sheet) => {
            const cols = columnsForFlowSheet(round, sheet);
            const el = document.createElement("div");
            container.appendChild(el);
            const hot = new Handsontable(el, {
                data: padGrid(sheet.data, cols.length, 1),
                ...headerSettings(sheet, cols),
                readOnly: true,
                renderAllRows: true,
                height: "auto",
                licenseKey: "non-commercial-and-evaluation",
                // GridSettings has no `exportFile` field in the Handsontable 18 types
                // (its JSDoc names GridSettings but the interface omits it); the
                // index signature accepts it and the plugin reads it at runtime.
                exportFile: { engines: { xlsx: ExcelJS } },
                cell: Object.entries(sheet.meta).map(([key, m]) => {
                    const [row, col] = key.split(",").map(Number);
                    return { row, col, className: metaToClassName(m) };
                }),
            });
            instances.push(hot);
            return { instance: hot, name: safeSheetName(sheet.title, used) };
        });

        const plugin = instances[0].getPlugin("exportFile");
        // exportAsBlob() throws for binary formats ("Use exportAsBlobAsync()
        // instead"); exportAsBlobAsync() is the documented Promise<Blob> path
        // for xlsx and is what actually runs the ExcelJS engine.
        const blob = await plugin.exportAsBlobAsync("xlsx", { sheets, colHeaders: true });

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await blob.arrayBuffer());
        applyInfoWorksheet(workbook, round);
        maybeAddRfdWorksheet(workbook, round);
        const out = await workbook.xlsx.writeBuffer();
        await saveBlob(
            new Blob([out], { type: XLSX_MIME }),
            exportFilename(round.role, round.createdAt, "xlsx"),
        );
    } finally {
        for (const hot of instances) hot.destroy();
        container.remove();
    }
}
