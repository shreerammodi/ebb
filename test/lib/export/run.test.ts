import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/persistence/flowIo", () => ({ downloadFlowFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({ downloadXlsx: vi.fn() }));

import { runExport } from "@/lib/export/run";
import { downloadXlsx } from "@/lib/export/xlsx";
import { makeFlowRound } from "@/lib/model/flow";
import { downloadFlowFile } from "@/lib/persistence/flowIo";

const round = makeFlowRound({ role: "aff" });

describe("runExport", () => {
    it("routes json to downloadFlowFile", async () => {
        await runExport(round, "json");
        expect(downloadFlowFile).toHaveBeenCalledWith(round);
    });
    it("routes excel to downloadXlsx", async () => {
        await runExport(round, "excel");
        expect(downloadXlsx).toHaveBeenCalledWith(round);
    });
});
