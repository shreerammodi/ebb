import type { FlowRound } from "@/lib/model/flow";
import { downloadFlowFile } from "@/lib/persistence/flowIo";

import { downloadXlsx } from "./xlsx";

export type ExportFormat = "json" | "excel";

/** Run a per-round export in the requested format. */
export async function runExport(round: FlowRound, fmt: ExportFormat): Promise<void> {
    if (fmt === "json") {
        downloadFlowFile(round);
        return;
    }
    await downloadXlsx(round);
}
