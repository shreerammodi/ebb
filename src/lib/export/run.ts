import type { Round } from "@/lib/model/types";
import type { ExportOptions } from "./options";
import { downloadRoundFile } from "@/lib/persistence/io";
import { downloadXlsx } from "./xlsx";

export type ExportFormat = "json" | "excel";

/** Run a per-round export in the requested format. */
export async function runExport(
    round: Round,
    opts: ExportOptions,
    fmt: ExportFormat,
): Promise<void> {
    if (fmt === "json") {
        downloadRoundFile(round);
        return;
    }
    await downloadXlsx(round, opts);
}
