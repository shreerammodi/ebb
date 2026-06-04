import { describe, it, expect } from "vitest";
import { buildExportSheets } from "./cells";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";

function round(): Round {
  return {
    id: "r",
    createdAt: 0,
    updatedAt: 0,
    role: "aff",
    format: {
      id: "f",
      name: "Policy",
      prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: "s0", name: "1AC", side: "aff", seconds: 0 },
        { id: "s1", name: "1NC", side: "neg", seconds: 0 },
      ],
    },
    meta: {},
    scouting: emptyScouting(),
    sheets: [{ id: "sh", title: "T", group: "aff", order: 0 }],
    nodes: [
      {
        id: "p",
        sheetId: "sh",
        speechId: "s0",
        parentId: null,
        order: 0,
        text: "Root",
        statuses: [],
      },
      {
        id: "c",
        sheetId: "sh",
        speechId: "s1",
        parentId: "p",
        order: 0,
        text: "Resp",
        statuses: ["conceded"],
      },
    ],
    timers: {
      activeSpeechId: null,
      speechRemaining: null,
      running: false,
      prepRemaining: { aff: 0, neg: 0 },
      prepRunning: null,
    },
  };
}

describe("buildExportSheets", () => {
  it("produces placed cells with numbering prefix and decorations", () => {
    const [es] = buildExportSheets(round());
    expect(es.sheet.title).toBe("T");
    const root = es.cells.find((c) => c.col === 0)!;
    expect(root.text).toBe("Root"); // roots are unnumbered
    expect(root.speechName).toBe("1AC");
    const resp = es.cells.find((c) => c.col === 1)!;
    expect(resp.text).toBe("1. Resp"); // response numbered within siblings
    expect(resp.crossed).toBe(true); // conceded -> crossed
    expect(resp.row).toBe(0);
  });
});
