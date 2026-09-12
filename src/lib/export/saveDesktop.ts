/**
 * Desktop save path for exports: the native save panel, then one write.
 *
 * Imports here are static, like the desktop flow adapter, because this module
 * is only ever reached through the dynamic import in `download.ts`, so it
 * never loads in a browser and never drags Tauri's JS API into that bundle.
 */

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/** What the picker calls each export format it is seeded with. */
const FILTER_NAMES: Record<string, string> = {
    xlsx: "Excel workbook",
    csv: "CSV",
    json: "JSON",
};

/**
 * Ask where the export goes, then write it there. Null from the panel is the
 * user cancelling, which saves nothing.
 */
export async function saveExportFile(bytes: Uint8Array, filename: string): Promise<void> {
    const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
    const name = FILTER_NAMES[ext];
    const picked = await save({
        defaultPath: filename,
        filters: name ? [{ name, extensions: [ext] }] : [],
    });
    if (!picked) return;
    // A picker hands back exactly what the user typed, which may have dropped
    // the extension the filter implies; Excel opens the file by its name.
    const path = picked.toLowerCase().endsWith(`.${ext}`) ? picked : `${picked}.${ext}`;
    await invoke("write_export_file", { path, contents: Array.from(bytes) });
}
