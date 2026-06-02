/** Filename + download helpers shared by the exporters. */

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

/** Compact date for filenames: YYYYMMDD (UTC). */
function compactDate(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
}

/** Human date for spreadsheet cells: YYYY-MM-DD (UTC). */
export function isoDate(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

/** e.g. debate-flow-aff-20260602.xlsm */
export function exportFilename(role: string, ts: number, ext: string): string {
  return `debate-flow-${sanitize(role)}-${compactDate(ts)}.${ext}`;
}

/** Trigger a browser download of a Blob. No-op safe outside the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
