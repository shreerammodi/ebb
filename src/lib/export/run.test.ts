import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/persistence/flowIo", () => ({ downloadFlowFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({ downloadXlsx: vi.fn() }));

import { downloadXlsx } from "@/lib/export/xlsx";
import { makeFlowRound } from "@/lib/model/flow";
import { downloadFlowFile } from "@/lib/persistence/flowIo";

import { runExport } from "./run";

const round = makeFlowRound("aff");

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
