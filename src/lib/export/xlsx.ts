/**
 * Excel exporter. Edits the Flow.xlsx OOXML zip to add populated sheets derived
 * from the hidden AFF/NEG template sheets, then re-zips as .xlsx.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

import type { FlowRound } from "@/lib/model/flow";

import { buildExportSheets } from "./cells";
import { cxPeriods } from "./cx";
import { isoDate, exportFilename, saveBlob } from "./download";
import {
    buildFlowSheetXml,
    registerSheetsInRels,
    removeCalcChainFromRels,
    registerSheetsInContentTypes,
    setCellInline,
    escXml,
    type NewSheet,
} from "./xlsxParts";

/** Resolve a worksheet name -> part filename (e.g. "AFF" -> "sheet2.xml") using workbook + rels XML. */
function resolveSheetPart(workbookXml: string, relsXml: string, sheetName: string): string {
    const ridMatch = workbookXml.match(new RegExp(`name="${sheetName}"[^>]*r:id="([^"]+)"`));
    if (!ridMatch) throw new Error(`Sheet "${sheetName}" not found in workbook`);
    const rid = ridMatch[1];
    const targetMatch = relsXml.match(new RegExp(`Id="${rid}"[^>]*Target="worksheets/([^"]+)"`));
    if (!targetMatch) throw new Error(`Relationship ${rid} not found`);
    return targetMatch[1];
}

/** Highest rId number present in the rels XML. */
function maxRidNumber(relsXml: string): number {
    const re = /Id="rId(\d+)"/g;
    let max = 0,
        m;
    while ((m = re.exec(relsXml)) !== null) max = Math.max(max, parseInt(m[1]));
    return max;
}

/** First N where xl/worksheets/sheetN.xml does not exist in the zip. */
function nextPartNumber(files: Record<string, Uint8Array>): number {
    let n = 1;
    while (files[`xl/worksheets/sheet${n}.xml`]) n++;
    return n;
}

/** Highest sheetId value in workbook.xml. */
function maxSheetId(workbookXml: string): number {
    const re = /sheetId="(\d+)"/g;
    let max = 0,
        m;
    while ((m = re.exec(workbookXml)) !== null) max = Math.max(max, parseInt(m[1]));
    return max;
}

/**
 * Update docProps/app.xml to include the new sheets in HeadingPairs count and
 * TitlesOfParts list. Excel repairs (and alerts) when the declared count doesn't
 * match the actual sheet count in workbook.xml.
 */
function updateAppXml(appXml: string, newSheets: NewSheet[]): string {
    const n = newSheets.length;
    // Bump the worksheet count in HeadingPairs (<vt:i4>N</vt:i4>).
    let out = appXml.replace(
        /<vt:i4>(\d+)<\/vt:i4>/,
        (_, c) => `<vt:i4>${parseInt(c) + n}</vt:i4>`,
    );
    // Bump the vector size in TitlesOfParts.
    out = out.replace(
        /(<TitlesOfParts>[\s\S]*?<vt:vector size=")(\d+)(")/,
        (_, pre, c, post) => `${pre}${parseInt(c) + n}${post}`,
    );
    // Append new sheet names before the closing </vt:vector> inside TitlesOfParts.
    const entries = newSheets.map((s) => `<vt:lpstr>${escXml(s.name)}</vt:lpstr>`).join("");
    out = out.replace(/(<\/vt:vector><\/TitlesOfParts>)/, `${entries}$1`);
    return out;
}

/**
 * Write CX question/response pairs into the CX worksheet.
 *
 * CX worksheet layout (from xl/worksheets/sheet5.xml in Flow.xlsx template):
 *   Row 1: Period headers merged over column pairs (A1:B1=1AC CX, C1:D1=1NC CX, E1:F1=2AC CX, G1:H1=2NC CX)
 *   Row 2: Column headers (Question/Response alternating A-H)
 *   Row 3+: Data rows
 *
 * CX data comes from the app's CX sheet grid via cxPeriods; the 4 periods map
 * to column pairs A/B, C/D, E/F, G/H.
 */
function patchCx(cxXml: string, round: FlowRound): string {
    // Excel-specific column + style mapping, keyed by CX period order.
    const CELLS = [
        { qCol: "A", rCol: "B", qStyle: 23, rStyle: 27 },
        { qCol: "C", rCol: "D", qStyle: 29, rStyle: 25 },
        { qCol: "E", rCol: "F", qStyle: 23, rStyle: 27 },
        { qCol: "G", rCol: "H", qStyle: 29, rStyle: 23 },
    ];
    const FIRST_DATA_ROW = 3;

    const perPeriod = cxPeriods(round).map((p, i) => ({ ...p, ...CELLS[i] }));
    const maxRows = Math.max(0, ...perPeriod.map((p) => p.pairs.length));
    if (maxRows === 0) return cxXml;

    const makeCell = (ref: string, value: string, style: number): string =>
        `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;

    let insertedRows = "";
    for (let i = 0; i < maxRows; i++) {
        const rowNum = FIRST_DATA_ROW + i;
        let cells = "";
        for (const p of perPeriod) {
            const pair = p.pairs[i];
            if (!pair) continue;
            if (pair.question.trim())
                cells += makeCell(`${p.qCol}${rowNum}`, pair.question, p.qStyle);
            if (pair.response.trim())
                cells += makeCell(`${p.rCol}${rowNum}`, pair.response, p.rStyle);
        }
        if (cells) insertedRows += `<row r="${rowNum}" spans="1:8">${cells}</row>`;
    }

    let out = cxXml.replace("</sheetData>", `${insertedRows}</sheetData>`);
    const lastRow = FIRST_DATA_ROW + maxRows - 1;
    out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:H${lastRow}"/>`);
    return out;
}

function patchInfo(infoXml: string, round: FlowRound): string {
    let xml = infoXml;
    const sc = round.scouting;
    const set = (ref: string, v?: string) => {
        if (v && v.trim()) xml = setCellInline(xml, ref, v);
    };

    set("D5", sc.affSchool);
    set("H5", sc.negSchool);
    set("D8", sc.aff.first.first);
    set("E8", sc.aff.first.last);
    set("D9", sc.aff.second.first);
    set("E9", sc.aff.second.last);
    set("H8", sc.neg.first.first);
    set("I8", sc.neg.first.last);
    set("H9", sc.neg.second.first);
    set("I9", sc.neg.second.last);
    set("D11", sc.tournament);
    set("D12", sc.judge);
    set("D13", sc.date || isoDate(round.createdAt));
    if (sc.decision?.vote) set("F16", sc.decision.vote.toUpperCase());
    set("D32", sc.decision?.rfd);
    return xml;
}

/**
 * Coerce a flow-sheet title into a legal, unique Excel tab name. Excel rejects
 * the characters : \ / ? * [ ], caps names at 31 chars, and requires names to
 * be unique case-insensitively across the workbook - any violation triggers the
 * "Worksheet properties" repair dialog. `used` holds the lowercased names already
 * taken; the chosen name is added to it so callers stay collision-free.
 */
function safeSheetName(title: string, used: Set<string>): string {
    let base = (title ?? "")
        .replace(/[:\\/?*\[\]]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim();
    if (!base) base = "Sheet";
    if (base.length > 31) base = base.slice(0, 31).trim();

    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
        const suffix = ` (${n})`;
        name = base.slice(0, 31 - suffix.length).trim() + suffix;
        n++;
    }
    used.add(name.toLowerCase());
    return name;
}

/**
 * Reconstruct workbook.xml from scratch, preserving only the original <sheet>
 * entries and appending the new ones. Drops all co-authoring / revision /
 * VBA extension attributes that cause Excel's repair dialog on programmatically
 * generated .xlsx files (xr:revisionPtr, xr:uid, xr2:uid, mc:AlternateContent,
 * extLst, codeName, etc.) by simply not copying them - only the default and
 * r: namespaces and the <sheet> entries are carried over.
 */
function rebuildWorkbookXml(originalXml: string, newSheets: NewSheet[]): string {
    const existingSheets = originalXml.match(/<sheets>([\s\S]*?)<\/sheets>/)?.[1] ?? "";
    const newSheetEntries = newSheets
        .map((s) => `<sheet name="${escXml(s.name)}" sheetId="${s.sheetId}" r:id="${s.rid}"/>`)
        .join("");

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="10531"/>' +
        '<workbookPr defaultThemeVersion="202300"/>' +
        '<bookViews><workbookView xWindow="100" yWindow="700" windowWidth="51000" windowHeight="28000"/></bookViews>' +
        `<sheets>${existingSheets}${newSheetEntries}</sheets>` +
        '<calcPr calcId="191029"/>' +
        "</workbook>"
    );
}

/** Build the populated .xlsx bytes. Pure given the template bytes. */
export function buildXlsx(round: FlowRound, templateBytes: Uint8Array): Uint8Array {
    // First, strip revision data from the template to prevent corruption.
    const stripped = unzipSync(templateBytes);
    const stripRevision = (bytes: Uint8Array) => {
        const xml = strFromU8(bytes);
        let clean = xml
            .replace(/ xr:revisionPtr="[^"]*"/g, "")
            .replace(/ xr:uid="[^"]*"/g, "")
            .replace(/<xr:revisionPtr[^>]*>\d+<\/xr:revisionPtr>/g, "")
            .replace(/<xr:uid[^>]*>[\s\S]*?<\/xr:uid>/g, "")
            .replace(/<x:embed[^>]*>/g, "")
            .replace(/<xlink:[^>]*>/g, "")
            .replace(/ codeName="[^"]*"/g, "");
        return strToU8(clean);
    };

    const files = Object.assign({}, stripped);
    for (const key of Object.keys(files)) {
        if (key.startsWith("xl/worksheets/") && key.endsWith(".xml")) {
            files[key] = stripRevision(files[key]);
        }
    }

    const workbookXml = strFromU8(files["xl/workbook.xml"]);
    const relsXml = strFromU8(files["xl/_rels/workbook.xml.rels"]);

    const affPart = resolveSheetPart(workbookXml, relsXml, "AFF");
    const negPart = resolveSheetPart(workbookXml, relsXml, "NEG");
    const infoPart = resolveSheetPart(workbookXml, relsXml, "Info");

    files[`xl/worksheets/${infoPart}`] = strToU8(
        patchInfo(strFromU8(files[`xl/worksheets/${infoPart}`]), round),
    );

    const cxPart = resolveSheetPart(workbookXml, relsXml, "CX");
    files[`xl/worksheets/${cxPart}`] = strToU8(
        patchCx(strFromU8(files[`xl/worksheets/${cxPart}`]), round),
    );

    // Build one new worksheet per flow sheet. The CX flow sheet's content is
    // already written into the template's dedicated CX worksheet above
    // (patchCx), so it must not also get its own worksheet - doing so creates
    // a duplicate "CX" tab name and corrupts the workbook.
    const exportSheets = buildExportSheets(round).filter((es) => es.sheet.kind !== "cx");
    const baseSheetId = maxSheetId(workbookXml);
    const baseRid = maxRidNumber(relsXml);
    const basePart = nextPartNumber(files);
    const newSheets: NewSheet[] = [];

    // Excel tab names must be unique (case-insensitively) across the whole
    // workbook, so seed the used-name set with the template's existing tab names.
    const usedNames = new Set(
        [...workbookXml.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1].toLowerCase()),
    );

    exportSheets.forEach((es, i) => {
        const partName = `sheet${basePart + i}.xml`;
        const meta: NewSheet = {
            name: safeSheetName(es.sheet.title, usedNames),
            sheetId: baseSheetId + 1 + i,
            rid: `rId${baseRid + 1 + i}`,
            partName,
        };
        const tmpl =
            es.sheet.group === "aff"
                ? files[`xl/worksheets/${affPart}`]
                : files[`xl/worksheets/${negPart}`];
        const tmplXml = strFromU8(tmpl);
        const flowXml = buildFlowSheetXml(tmplXml, es);
        files[`xl/worksheets/${partName}`] = strToU8(flowXml);
        newSheets.push(meta);
    });

    files["xl/workbook.xml"] = strToU8(rebuildWorkbookXml(workbookXml, newSheets));
    files["xl/_rels/workbook.xml.rels"] = strToU8(
        removeCalcChainFromRels(registerSheetsInRels(relsXml, newSheets)),
    );
    files["[Content_Types].xml"] = strToU8(
        registerSheetsInContentTypes(strFromU8(files["[Content_Types].xml"]), newSheets),
    );

    // Sync app.xml's worksheet count - a mismatch triggers Excel's repair dialog.
    files["docProps/app.xml"] = strToU8(
        updateAppXml(strFromU8(files["docProps/app.xml"]), newSheets),
    );

    // Drop calcChain so Excel rebuilds it (worksheet set changed).
    delete files["xl/calcChain.xml"];

    return zipSync(files);
}

/** Browser orchestrator: fetch template, build, download. */
export async function downloadXlsx(round: FlowRound): Promise<void> {
    const res = await fetch("/templates/Flow.xlsx");
    if (!res.ok) throw new Error("Could not load the Excel template");
    const templateBytes = new Uint8Array(await res.arrayBuffer());
    const bytes = buildXlsx(round, templateBytes);
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await saveBlob(blob, exportFilename(round.role, round.createdAt, "xlsx"));
}
