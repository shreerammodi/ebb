/**
 * Excel exporter. Edits the Flow.xlsx OOXML zip to add populated sheets derived
 * from the hidden AFF/NEG template sheets, then re-zips as .xlsx.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { Round } from '@/lib/model/types';
import { buildExportSheets } from './cells';
import {
  buildFlowSheetXml,
  registerSheetsInRels,
  removeCalcChainFromRels,
  registerSheetsInContentTypes,
  setCellInline,
  escXml,
  type NewSheet,
} from './xlsxParts';
import { isoDate, exportFilename, downloadBlob } from './download';

/** Resolve a sheet name → part filename (e.g. "AFF" → "sheet2.xml") using workbook + rels XML. */
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
  let max = 0, m;
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
  let max = 0, m;
  while ((m = re.exec(workbookXml)) !== null) max = Math.max(max, parseInt(m[1]));
  return max;
}

/**
 * Reconstruct workbook.xml from scratch, preserving only the original <sheet>
 * entries and appending the new ones. Drops all co-authoring / revision /
 * VBA extension attributes that cause Excel's repair dialog on programmatically
 * generated .xlsx files (xr:revisionPtr, xr2:uid, mc:AlternateContent, extLst,
 * codeName, etc.).
 */
function rebuildWorkbookXml(originalXml: string, newSheets: NewSheet[]): string {
  const existingSheets = originalXml.match(/<sheets>([\s\S]*?)<\/sheets>/)?.[1] ?? '';
  const newSheetEntries = newSheets
    .map(s => `<sheet name="${escXml(s.name)}" sheetId="${s.sheetId}" r:id="${s.rid}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="10531"/>' +
    '<workbookPr defaultThemeVersion="202300"/>' +
    '<bookViews><workbookView xWindow="100" yWindow="700" windowWidth="51000" windowHeight="28000"/></bookViews>' +
    `<sheets>${existingSheets}${newSheetEntries}</sheets>` +
    '<calcPr calcId="191029"/>' +
    '</workbook>'
  );
}

/**
 * Update docProps/app.xml to include the new sheets in HeadingPairs count and
 * TitlesOfParts list. Excel repairs (and alerts) when the declared count doesn't
 * match the actual sheet count in workbook.xml.
 */
function updateAppXml(appXml: string, newSheets: NewSheet[]): string {
  const n = newSheets.length;
  // Bump the worksheet count in HeadingPairs (<vt:i4>N</vt:i4>).
  let out = appXml.replace(/<vt:i4>(\d+)<\/vt:i4>/, (_, c) => `<vt:i4>${parseInt(c) + n}</vt:i4>`);
  // Bump the vector size in TitlesOfParts.
  out = out.replace(
    /(<TitlesOfParts>[\s\S]*?<vt:vector size=")(\d+)(")/,
    (_, pre, c, post) => `${pre}${parseInt(c) + n}${post}`,
  );
  // Append new sheet names before the closing </vt:vector> inside TitlesOfParts.
  const entries = newSheets.map(s => `<vt:lpstr>${escXml(s.name)}</vt:lpstr>`).join('');
  out = out.replace(/(<\/vt:vector><\/TitlesOfParts>)/, `${entries}$1`);
  return out;
}

function patchInfo(infoXml: string, round: Round): string {
  let xml = infoXml;
  const sc = round.scouting;
  const set = (ref: string, v?: string) => { if (v && v.trim()) xml = setCellInline(xml, ref, v); };

  set('D5', sc.affSchool);
  set('H5', sc.negSchool);
  set('D8', sc.aff.first.first);  set('E8', sc.aff.first.last);
  set('D9', sc.aff.second.first); set('E9', sc.aff.second.last);
  set('H8', sc.neg.first.first);  set('I8', sc.neg.first.last);
  set('H9', sc.neg.second.first); set('I9', sc.neg.second.last);
  set('D11', sc.tournament);
  set('D12', sc.judge);
  set('D13', sc.date || isoDate(round.createdAt));
  if (sc.decision?.vote) set('F16', sc.decision.vote.toUpperCase());
  set('D32', sc.decision?.rfd);
  return xml;
}

/** Build the populated .xlsx bytes. Pure given the template bytes. */
export function buildXlsx(round: Round, templateBytes: Uint8Array): Uint8Array {
  const files = unzipSync(templateBytes);
  const workbookXml = strFromU8(files['xl/workbook.xml']);
  const relsXml = strFromU8(files['xl/_rels/workbook.xml.rels']);

  const affPart = resolveSheetPart(workbookXml, relsXml, 'AFF');
  const negPart = resolveSheetPart(workbookXml, relsXml, 'NEG');
  const infoPart = resolveSheetPart(workbookXml, relsXml, 'Info');

  // Strip codeName from all template worksheet parts — VBA artifact invalid in .xlsx.
  for (const key of Object.keys(files)) {
    if (key.startsWith('xl/worksheets/') && key.endsWith('.xml')) {
      files[key] = strToU8(strFromU8(files[key]).replace(/ codeName="[^"]*"/g, ''));
    }
  }

  const affTemplate = strFromU8(files[`xl/worksheets/${affPart}`]);
  const negTemplate = strFromU8(files[`xl/worksheets/${negPart}`]);

  // Patch Info sheet.
  files[`xl/worksheets/${infoPart}`] = strToU8(patchInfo(strFromU8(files[`xl/worksheets/${infoPart}`]), round));

  // Build one new sheet per flow sheet.
  const exportSheets = buildExportSheets(round);
  const baseSheetId = maxSheetId(workbookXml);
  const baseRid = maxRidNumber(relsXml);
  const basePart = nextPartNumber(files);
  const newSheets: NewSheet[] = [];

  exportSheets.forEach((es, i) => {
    const partName = `sheet${basePart + i}.xml`;
    const meta: NewSheet = {
      name: es.sheet.title || `Sheet ${i + 1}`,
      sheetId: baseSheetId + 1 + i,
      rid: `rId${baseRid + 1 + i}`,
      partName,
    };
    const tmpl = es.sheet.group === 'aff' ? affTemplate : negTemplate;
    files[`xl/worksheets/${partName}`] = strToU8(buildFlowSheetXml(tmpl, es));
    newSheets.push(meta);
  });

  files['xl/workbook.xml'] = strToU8(rebuildWorkbookXml(workbookXml, newSheets));
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    removeCalcChainFromRels(registerSheetsInRels(relsXml, newSheets)),
  );
  files['[Content_Types].xml'] = strToU8(registerSheetsInContentTypes(strFromU8(files['[Content_Types].xml']), newSheets));

  // Sync app.xml sheet count — mismatch triggers Excel's repair dialog.
  files['docProps/app.xml'] = strToU8(updateAppXml(strFromU8(files['docProps/app.xml']), newSheets));

  // Drop calcChain so Excel rebuilds it (sheet set changed).
  delete files['xl/calcChain.xml'];

  return zipSync(files);
}

/** Browser orchestrator: fetch template, build, download. */
export async function downloadXlsx(round: Round): Promise<void> {
  const res = await fetch('/templates/Flow.xlsx');
  if (!res.ok) throw new Error('Could not load the Excel template');
  const templateBytes = new Uint8Array(await res.arrayBuffer());
  const bytes = buildXlsx(round, templateBytes);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, 'xlsx'));
}
