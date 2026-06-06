import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "./pdf";
import type { Round } from "@/lib/model/types";
import { emptyScouting } from "@/lib/model/normalize";

function round(sheets: number): Round {
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
    sheets: Array.from({ length: sheets }, (_, i) => ({
      id: `sh${i}`,
      title: `S${i}`,
      group: "aff" as const,
      order: i,
    })),
    nodes: [
      {
        id: "p",
        sheetId: "sh0",
        speechId: "s0",
        parentId: null,
        order: 0,
        text: "Hello",
        statuses: [],
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

describe("buildPdf", () => {
  it("produces a valid PDF with one page per sheet", async () => {
    const bytes = await buildPdf(round(2));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });
});
