import type { Format, Sheet, Speech } from "@/lib/model/types";
import { CX_COLUMNS } from "@/lib/model/cxColumns";

/**
 * The columns a sheet shows. CX sheets use the fixed Question/Response column
 * set; flow sheets show from their leftmost speech to the end of the format.
 * The leftmost is `sheet.startSpeechId` if set; otherwise it is derived from
 * the sheet's side (aff → first speech; neg → first neg speech).
 */
export function columnsForSheet(format: Format, sheet: Sheet): Speech[] {
  if (sheet.kind === "cx") return CX_COLUMNS;
  const speeches = format.speeches;
  let startId = sheet.startSpeechId;
  if (!startId) {
    startId =
      sheet.group === "neg"
        ? (speeches.find((s) => s.side === "neg")?.id ?? speeches[0]?.id)
        : speeches[0]?.id;
  }
  const idx = speeches.findIndex((s) => s.id === startId);
  return idx === -1 ? speeches : speeches.slice(idx);
}
