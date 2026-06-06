import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "./pdf";
import { DEFAULT_EXPORT_OPTIONS } from "./options";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";

function baseRound(over: Partial<Round> = {}): Round {
  return {
    id: "r", createdAt: 0, updatedAt: 0, role: "aff",
    format: {
      id: "f", name: "Policy", prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: "s0", name: "1AC", side: "aff", seconds: 0 },
        { id: "s1", name: "1NC", side: "neg", seconds: 0 },
      ],
    },
    scouting: { ...emptyScouting(), tournament: "TOC", judge: "Lee" },
    sheets: [{ id: "sh", title: "Case", group: "aff", order: 0, kind: "flow" }],
    nodes: [],
    groups: [],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
    ...over,
  } as Round;
}

describe("buildPdf", () => {
  it("always emits a cover page even for an empty round", async () => {
    const doc = await PDFDocument.load(await buildPdf(baseRound({ sheets: [] }), DEFAULT_EXPORT_OPTIONS));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates a tall sheet across multiple pages", async () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({
      id: `n${i}`, sheetId: "sh", speechId: "s0", parentId: null, order: i,
      text: `Argument number ${i} with enough text to occupy a row`, statuses: [], bold: false,
    }));
    const doc = await PDFDocument.load(await buildPdf(baseRound({ nodes }), DEFAULT_EXPORT_OPTIONS));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3); // cover + >=2 body pages
  });

  it("produces a valid PDF for a CX sheet", async () => {
    const r = baseRound({
      sheets: [{ id: "cx", title: "CX", group: "aff", order: -1, kind: "cx" }],
      nodes: [
        { id: "q", sheetId: "cx", speechId: "cx-1ac-q", parentId: null, order: 0, text: "Why?", statuses: [], bold: false },
        { id: "a", sheetId: "cx", speechId: "cx-1ac-r", parentId: "q", order: 0, text: "Because", statuses: [], bold: false },
      ],
    });
    const doc = await PDFDocument.load(await buildPdf(r, DEFAULT_EXPORT_OPTIONS));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2); // cover + cx
  });

  it("renders a very long cell without throwing", async () => {
    const long = "word ".repeat(400).trim();
    const r = baseRound({ nodes: [
      { id: "n", sheetId: "sh", speechId: "s0", parentId: null, order: 0, text: long, statuses: ["conceded","extended"], bold: true, dropped: false } as any,
    ] });
    const doc = await PDFDocument.load(await buildPdf(r, DEFAULT_EXPORT_OPTIONS));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
