import { describe, it, expect } from "vitest";
import { buildExportSheets } from "./cells";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";
import { DEFAULT_EXPORT_OPTIONS } from "./options";

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
        bold: false,
      },
      {
        id: "c",
        sheetId: "sh",
        speechId: "s1",
        parentId: "p",
        order: 0,
        text: "Resp",
        statuses: ["conceded"],
        bold: false,
      },
    ],
    groups: [],
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
    const [es] = buildExportSheets(round(), DEFAULT_EXPORT_OPTIONS);
    expect(es.sheet.title).toBe("T");
    const root = es.cells.find((c) => c.col === 0)!;
    expect(root.text).toBe("Root"); // roots are unnumbered
    expect(root.speechName).toBe("1AC");
    const resp = es.cells.find((c) => c.col === 1)!;
    expect(resp.text).toBe("1. Resp"); // response numbered within siblings
    expect(resp.crossed).toBe(true); // conceded -> crossed
    expect(resp.row).toBe(0);
  });

  it("omits numbering when autoNumber is off", () => {
    const [es] = buildExportSheets(round(), { autoNumber: false, labelDrops: false });
    expect(es.cells.find((c) => c.text === "Root")).toBeTruthy(); // no "1. " prefix
  });

  it("applies numbering when autoNumber is on", () => {
    const [es] = buildExportSheets(round(), { autoNumber: true, labelDrops: false });
    expect(es.cells.some((c) => c.text.startsWith("1. "))).toBe(true);
  });

  it("carries nodeId, rowSpan and bold on cells", () => {
    const [es] = buildExportSheets(round(), { autoNumber: true, labelDrops: true });
    const root = es.cells.find((c) => c.nodeId === "p");
    expect(root).toBeTruthy();
    expect(typeof root!.rowSpan).toBe("number");
    expect(root!.bold).toBe(false);
  });

  it("flags dropped cells only when labelDrops is on", () => {
    // Two aff roots on 1AC: "answered" gets a 1NC child; "dropped" gets none.
    // 1NC has content, so the unanswered root is a drop.
    const r = round();
    r.nodes = [
      { id: "answered", sheetId: "sh", speechId: "s0", parentId: null, order: 0, text: "Answered", statuses: [], bold: false },
      { id: "reply", sheetId: "sh", speechId: "s1", parentId: "answered", order: 0, text: "Reply", statuses: [], bold: false },
      { id: "dropped", sheetId: "sh", speechId: "s0", parentId: null, order: 1, text: "Dropped", statuses: [], bold: false },
    ];
    const on = buildExportSheets(r, { autoNumber: true, labelDrops: true })[0];
    const off = buildExportSheets(r, { autoNumber: true, labelDrops: false })[0];
    expect(on.cells.find((c) => c.nodeId === "dropped")!.dropped).toBe(true);
    expect(on.cells.find((c) => c.nodeId === "answered")!.dropped).toBe(false);
    expect(off.cells.every((c) => c.dropped === false)).toBe(true);
  });
});
