import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { buildXlsx } from './xlsx';
import type { Round } from '@/lib/model/types';
import { emptyScouting, emptyCx } from '@/lib/model/normalize';

const template = new Uint8Array(
  readFileSync(resolve(process.cwd(), 'public/templates/Flow.xlsx')),
);

function round(): Round {
  return {
    id: 'r', createdAt: Date.UTC(2026, 5, 2), updatedAt: 0, role: 'aff',
    format: {
      id: 'f', name: 'Policy', prepSeconds: { aff: 0, neg: 0 },
      speeches: [
        { id: 's0', name: '1AC', side: 'aff', seconds: 0 },
        { id: 's1', name: '1NC', side: 'neg', seconds: 0 },
      ],
    },
    meta: { tournament: 'States', roundLabel: 'R3' },
    scouting: emptyScouting(),
    cx: emptyCx(),
    sheets: [{ id: 'sh', title: 'Politics DA', group: 'aff', order: 0 }],
    nodes: [
      { id: 'p', sheetId: 'sh', speechId: 's0', parentId: null, order: 0, text: 'Uniqueness', statuses: [] },
    ],
    timers: { activeSpeechId: null, speechRemaining: null, running: false, prepRemaining: { aff: 0, neg: 0 }, prepRunning: null },
  };
}

describe('buildXlsx', () => {
  it('produces a valid zip with a populated sheet and patched Info', () => {
    const bytes = buildXlsx(round(), template);
    const files = unzipSync(bytes);

    // calcChain dropped.
    expect(files['xl/calcChain.xml']).toBeUndefined();
    // Content type stays as standard xlsx.
    expect(strFromU8(files['[Content_Types].xml'])).toContain('spreadsheetml.sheet.main+xml');
    // New worksheet exists and contains the node text + sheet title.
    const newSheet = strFromU8(files['xl/worksheets/sheet6.xml']);
    expect(newSheet).toContain('Uniqueness');
    expect(newSheet).toContain('Politics DA');
    // Workbook registers the new tab name.
    expect(strFromU8(files['xl/workbook.xml'])).toContain('Politics DA');
    // calcChain relationship removed from rels — no dangling reference.
    expect(strFromU8(files['xl/_rels/workbook.xml.rels'])).not.toContain('calcChain');
    // No duplicate xr:uid on the cloned sheet — prevents Excel corruption.
    expect(newSheet).not.toContain('xr:uid=');
    // Body cells carry the column style index from the template.
    expect(newSheet).toContain('s="35"');
  });

  it('writes scouting fields into the Info sheet', () => {
    const r = round();
    r.scouting = {
      affSchool: 'Westwood', negSchool: 'Lincoln',
      aff: { first: { first: 'Al', last: 'Smith' }, second: { first: 'Bo', last: 'Jones' } },
      neg: { first: { first: 'Cy', last: 'Diaz' }, second: { first: 'Di', last: 'Eaton' } },
      tournament: 'Berkeley', round: '3', date: '2026-06-03', judge: 'Pat Lee',
      decision: { vote: 'aff', rfd: 'Clear on impacts.' },
    };
    const bytes = buildXlsx(r, template);
    const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('Westwood');
    expect(xml).toContain('Lincoln');
    expect(xml).toContain('Smith');
    expect(xml).toContain('Clear on impacts.');
  });
});
