import { describe, it, expect } from "vitest";

import { exportFilename, isoDate } from "./download";

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
