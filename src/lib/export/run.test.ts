import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/persistence/io", () => ({ downloadRoundFile: vi.fn() }));
vi.mock("@/lib/export/xlsx", () => ({ downloadXlsx: vi.fn() }));

import { runExport } from "./run";
import { downloadRoundFile } from "@/lib/persistence/io";
import { downloadXlsx } from "@/lib/export/xlsx";
import { emptyScouting } from "@/lib/model/normalize";
import type { Round } from "@/lib/model/types";

const round = {
    id: "r",
    createdAt: 1,
    updatedAt: 1,
    role: "aff",
    format: {
        id: "f",
        name: "T",
        speeches: [],
        prepSeconds: { aff: 240, neg: 240 },
    },
    scouting: emptyScouting(),
    sheets: [],
    nodes: [],
    groups: [],
} as Round;

describe("runExport", () => {
    it("routes json → downloadRoundFile", async () => {
        await runExport(round, { autoNumber: true }, "json");
        expect(downloadRoundFile).toHaveBeenCalledWith(round);
    });
    it("routes excel → downloadXlsx", async () => {
        await runExport(round, { autoNumber: false }, "excel");
        expect(downloadXlsx).toHaveBeenCalledWith(round, { autoNumber: false });
    });
});
