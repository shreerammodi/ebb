import { describe, it, expect, vi, afterEach } from "vitest";

import { exportFilename, isoDate, saveBlob } from "./download";

describe("exportFilename", () => {
    it("builds a sanitized name with role, date, and extension", () => {
        const ts = Date.UTC(2026, 5, 2); // 2026-06-02
        expect(exportFilename("aff", ts, "xlsm")).toBe("debate-flow-aff-20260602.xlsm");
    });
});

describe("isoDate", () => {
    it("formats a timestamp as YYYY-MM-DD", () => {
        expect(isoDate(Date.UTC(2026, 5, 2))).toBe("2026-06-02");
    });
});

describe("saveBlob", () => {
    const win = window as unknown as { showSaveFilePicker?: unknown };

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
