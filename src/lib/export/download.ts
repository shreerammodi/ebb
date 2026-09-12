/** Filename and save helpers shared by the exporters. */

import { isDesktop } from "@/lib/update/adapter";

/** Human date for spreadsheet cells: YYYY-MM-DD (UTC). */
export function isoDate(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

/** e.g. debate-flow-20260602.xlsx */
export function exportFilename(ts: number, ext: string): string {
    return `debate-flow-${isoDate(ts).replaceAll("-", "")}.${ext}`;
}

export const MIME_BY_EXT: Record<string, string> = {
    ".json": "application/json",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
};

/** File-picker `types` filter derived from the suggested name's extension. */
function acceptFor(filename: string) {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    return mime ? [{ accept: { [mime]: [ext] } }] : undefined;
}

type SaveFilePicker = (opts: {
    suggestedName?: string;
    types?: { accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/**
 * Save a Blob from a browser. Where the File System Access API exists
 * (Chromium), opens a native "Save As" picker so the user chooses the
 * location; elsewhere - Safari, Firefox - no picker can be opened at all, so
 * it falls back to an anchor download into the browser's downloads directory.
 * A cancelled picker is a silent no-op. Must be called from a user gesture so
 * the picker counts as user-activated.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
        .showSaveFilePicker;
    if (picker) {
        let handle: FileSystemFileHandle;
        try {
            handle = await picker({ suggestedName: filename, types: acceptFor(filename) });
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            throw err;
        }
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Save exported bytes where the user says, never straight to a downloads
 * directory. Inside the desktop shell that is the native save panel plus the
 * `write_export_file` command; in a browser it is whatever picker the engine
 * offers. The desktop half is a dynamic import so the web bundle never pulls
 * in Tauri's JS API. Cancelling saves nothing and reports no error.
 */
export async function saveExport(bytes: Uint8Array<ArrayBuffer>, filename: string): Promise<void> {
    if (isDesktop()) {
        const { saveExportFile } = await import("./saveDesktop");
        await saveExportFile(bytes, filename);
        return;
    }
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    await saveBlob(new Blob([bytes], { type: MIME_BY_EXT[ext] }), filename);
}
