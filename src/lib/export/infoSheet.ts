/**
 * Info and RFD worksheets, written with ExcelJS after the grid export. (In
 * export code, "sheet" is the app's FlowSheet; Excel tabs are worksheets.)
 */

import type ExcelJS from "exceljs";

import type { FlowRound } from "@/lib/model/flow";
import type { Debater } from "@/lib/model/types";

import { isoDate } from "./download";

const fullName = (d: Debater): string => [d.first, d.last].filter(Boolean).join(" ");

/** Label in column A (bold), value in column B, on the given row. */
function labeled(ws: ExcelJS.Worksheet, row: number, label: string, value?: string): void {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    if (value && value.trim()) ws.getCell(row, 2).value = value;
}

export function applyInfoWorksheet(workbook: ExcelJS.Workbook, round: FlowRound): void {
    const ws = workbook.addWorksheet("Info", { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 36;
    const sc = round.scouting;
    labeled(ws, 2, "Tournament", sc.tournament);
    labeled(
        ws,
        3,
        "Round",
        [sc.round, sc.flight && `Flight ${sc.flight}`].filter(Boolean).join(" "),
    );
    labeled(ws, 4, "Date", sc.date || isoDate(round.createdAt));
    labeled(ws, 5, "Judge", sc.judge);
    labeled(ws, 7, "Aff School", sc.affSchool);
    labeled(ws, 8, "1A", fullName(sc.aff.first));
    labeled(ws, 9, "2A", fullName(sc.aff.second));
    labeled(ws, 11, "Neg School", sc.negSchool);
    labeled(ws, 12, "1N", fullName(sc.neg.first));
    labeled(ws, 13, "2N", fullName(sc.neg.second));
    labeled(ws, 15, "Decision", sc.decision?.vote?.toUpperCase());
}

/** RFD worksheet, only when there is a vote or a non-empty RFD to show. */
export function maybeAddRfdWorksheet(workbook: ExcelJS.Workbook, round: FlowRound): void {
    const decision = round.scouting.decision;
    const rfd = decision?.rfd?.trim() ?? "";
    if (!decision?.vote && !rfd) return;
    const ws = workbook.addWorksheet("RFD", { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 100;
    ws.getCell("A1").value = "Decision";
    ws.getCell("A1").font = { bold: true };
    if (decision?.vote) ws.getCell("B1").value = decision.vote.toUpperCase();
    if (rfd) {
        ws.getCell("A2").value = rfd;
        ws.getCell("A2").alignment = { wrapText: true, vertical: "top" };
    }
}
