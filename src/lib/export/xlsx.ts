/**
 * Excel exporter. Edits the Flow.xltm OOXML zip in place so the VBA macros and
 * exact styling survive, then re-zips as a macro-enabled .xlsm. The hidden AFF/NEG
 * template sheets are kept intact; one populated visible sheet is added per flow sheet.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { Round } from '@/lib/model/types';
import { buildExportSheets } from './cells';
import {
  buildFlowSheetXml,
  registerSheetsInWorkbook,
  registerSheetsInRels,
  registerSheetsInContentTypes,
  setCellInline,
  type NewSheet,
} from './xlsxParts';
import { isoDate, exportFilename, downloadBlob } from './download';

const AFF_TEMPLATE_PART = 'xl/worksheets/sheet2.xml';
const NEG_TEMPLATE_PART = 'xl/worksheets/sheet3.xml';
const INFO_PART = 'xl/worksheets/sheet1.xml';

/** Existing sheetIds in the template; new sheets start above the max. */
const EXISTING_SHEET_IDS = [1, 3, 21, 48, 35];
/** Existing relationship ids go up to rId11. */
const FIRST_NEW_RID = 12;
/** Existing worksheet parts are sheet1..sheet5; new parts start at sheet6. */
const FIRST_NEW_PART = 6;

function patchInfo(infoXml: string, round: Round): string {
  let xml = infoXml;
  const m = round.meta;
  if (m.tournament) xml = setCellInline(xml, 'D11', m.tournament);
  if (m.roundLabel) xml = setCellInline(xml, 'D12', m.roundLabel);
  xml = setCellInline(xml, 'D13', isoDate(round.createdAt));
  if (m.affName) xml = setCellInline(xml, 'D8', m.affName);
  if (m.negName) xml = setCellInline(xml, 'H8', m.negName);
  if (m.judge) xml = setCellInline(xml, 'D16', m.judge);
  return xml;
}

/** Build the populated .xlsm bytes. Pure given the template bytes. */
export function buildXlsx(round: Round, templateBytes: Uint8Array): Uint8Array {
  const files = unzipSync(templateBytes);

  const affTemplate = strFromU8(files[AFF_TEMPLATE_PART]);
  const negTemplate = strFromU8(files[NEG_TEMPLATE_PART]);

  // Patch Info.
  files[INFO_PART] = strToU8(patchInfo(strFromU8(files[INFO_PART]), round));

  // Build one new sheet per flow sheet.
  const exportSheets = buildExportSheets(round);
  const maxExistingId = Math.max(...EXISTING_SHEET_IDS);
  const newSheets: NewSheet[] = [];

  exportSheets.forEach((es, i) => {
    const partName = `sheet${FIRST_NEW_PART + i}.xml`;
    const meta: NewSheet = {
      name: es.sheet.title || `Sheet ${i + 1}`,
      sheetId: maxExistingId + 1 + i,
      rid: `rId${FIRST_NEW_RID + i}`,
      partName,
    };
    const tmpl = es.sheet.group === 'aff' ? affTemplate : negTemplate;
    files[`xl/worksheets/${partName}`] = strToU8(buildFlowSheetXml(tmpl, es));
    newSheets.push(meta);
  });

  // Register everywhere.
  files['xl/workbook.xml'] = strToU8(registerSheetsInWorkbook(strFromU8(files['xl/workbook.xml']), newSheets));
  files['xl/_rels/workbook.xml.rels'] = strToU8(registerSheetsInRels(strFromU8(files['xl/_rels/workbook.xml.rels']), newSheets));
  files['[Content_Types].xml'] = strToU8(registerSheetsInContentTypes(strFromU8(files['[Content_Types].xml']), newSheets));

  // Drop calcChain so Excel rebuilds it (sheet set changed).
  delete files['xl/calcChain.xml'];

  return zipSync(files);
}

/** Browser orchestrator: fetch template, build, download. */
export async function downloadXlsx(round: Round): Promise<void> {
  const res = await fetch('/templates/Flow.xltm');
  if (!res.ok) throw new Error('Could not load the Excel template');
  const templateBytes = new Uint8Array(await res.arrayBuffer());
  const bytes = buildXlsx(round, templateBytes);
  const blob = new Blob([bytes], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
  downloadBlob(blob, exportFilename(round.role, round.createdAt, 'xlsm'));
}
