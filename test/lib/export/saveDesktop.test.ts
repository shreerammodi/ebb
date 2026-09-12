/**
 * An export inside the desktop shell goes where the save panel says, and
 * nowhere at all when the panel is dismissed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveExportFile } from "@/lib/export/saveDesktop";

const invoke = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    save.mockReset();
});

describe("saveExportFile", () => {
    it("writes the bytes to the path the panel returned", async () => {
        save.mockResolvedValue("/Users/deb/Desktop/round.xlsx");

        await saveExportFile(new Uint8Array([0x50, 0x4b, 0xff]), "debate-flow-20260602.xlsx");

        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultPath: "debate-flow-20260602.xlsx",
                filters: [{ name: "Excel workbook", extensions: ["xlsx"] }],
            }),
        );
        expect(invoke).toHaveBeenCalledWith("write_export_file", {
            path: "/Users/deb/Desktop/round.xlsx",
            contents: [0x50, 0x4b, 0xff],
        });
    });

    it("adds the extension the user dropped", async () => {
        save.mockResolvedValue("/Users/deb/Desktop/round");

        await saveExportFile(new Uint8Array([1]), "flow.xlsx");

        expect(invoke).toHaveBeenCalledWith(
            "write_export_file",
            expect.objectContaining({ path: "/Users/deb/Desktop/round.xlsx" }),
        );
    });

    it("writes nothing when the panel is cancelled", async () => {
        save.mockResolvedValue(null);

        await saveExportFile(new Uint8Array([1]), "flow.xlsx");

        expect(invoke).not.toHaveBeenCalled();
    });
});
