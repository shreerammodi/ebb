import { describe, it, expect, vi, afterEach } from "vitest";

import { exportFilename, isoDate, saveBlob, saveExport } from "@/lib/export/download";

const saveExportFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/export/saveDesktop", () => ({ saveExportFile }));

/** isDesktop() reads this, the way the rest of the suite fakes a shell. */
function onDesktop(yes: boolean): void {
    if (yes) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

/** The picker the File System Access API bolts onto the window. */
const win = window as unknown as { showSaveFilePicker?: unknown };

describe("exportFilename", () => {
    it("builds a name from the date and extension", () => {
        const ts = Date.UTC(2026, 5, 2); // 2026-06-02
        expect(exportFilename(ts, "xlsm")).toBe("debate-flow-20260602.xlsm");
    });
});

describe("isoDate", () => {
    it("formats a timestamp as YYYY-MM-DD", () => {
        expect(isoDate(Date.UTC(2026, 5, 2))).toBe("2026-06-02");
    });
});

describe("saveBlob", () => {
    afterEach(() => {
        delete win.showSaveFilePicker;
        vi.restoreAllMocks();
    });

    it("uses the native picker and writes the blob when available", async () => {
        const write = vi.fn();
        const close = vi.fn();
        const picker = vi.fn().mockResolvedValue({
            createWritable: async () => ({ write, close }),
        });
        win.showSaveFilePicker = picker;

        const blob = new Blob(["hi"]);
        await saveBlob(blob, "x.json");

        expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "x.json" }));
        expect(write).toHaveBeenCalledWith(blob);
        expect(close).toHaveBeenCalled();
    });

    it("treats a cancelled picker as a silent no-op", async () => {
        win.showSaveFilePicker = vi
            .fn()
            .mockRejectedValue(new DOMException("cancelled", "AbortError"));
        await expect(saveBlob(new Blob(["hi"]), "x.json")).resolves.toBeUndefined();
    });

    it("falls back to an anchor download without the picker", async () => {
        const click = vi.fn();
        vi.spyOn(document, "createElement").mockReturnValue({
            click,
            style: {},
        } as unknown as HTMLAnchorElement);
        vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
        vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);

        await saveBlob(new Blob(["hi"]), "x.json");
        expect(click).toHaveBeenCalled();
    });
});

describe("saveExport", () => {
    afterEach(() => {
        onDesktop(false);
        saveExportFile.mockReset();
        delete win.showSaveFilePicker;
    });

    it("hands the bytes to the shell's save panel on the desktop", async () => {
        onDesktop(true);
        const bytes = new Uint8Array([1, 2, 3]);

        await saveExport(bytes, "x.xlsx");

        expect(saveExportFile).toHaveBeenCalledWith(bytes, "x.xlsx");
    });

    it("asks the browser's picker instead of downloading, off the desktop", async () => {
        const write = vi.fn();
        const picker = vi.fn().mockResolvedValue({
            createWritable: async () => ({ write, close: vi.fn() }),
        });
        win.showSaveFilePicker = picker;

        await saveExport(new Uint8Array([1]), "x.xlsx");

        expect(saveExportFile).not.toHaveBeenCalled();
        expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "x.xlsx" }));
        expect(write).toHaveBeenCalled();
    });
});
