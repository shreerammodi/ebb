import type { FlowRound } from "@/lib/model/flow";
import { downloadFlowFile } from "@/lib/persistence/flowIo";

export type ExportFormat = "json" | "excel";

/** Run a per-round export in the requested format. */
export async function runExport(round: FlowRound, fmt: ExportFormat): Promise<void> {
    if (fmt === "json") {
        await downloadFlowFile(round);
        return;
    }
    // Dynamic so Handsontable (pulled in by the xlsx exporter) stays out of the
    // dashboard's eager bundle and only loads when an Excel export runs.
    const { downloadXlsx } = await import("./xlsx");
    await downloadXlsx(round);
}
