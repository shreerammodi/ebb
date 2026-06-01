import { describe, expect, it } from 'vitest';
import { FILE_VERSION, exportRoundJSON, importRoundJSON } from './io';
import { makeFormatByKey } from '@/lib/format/presets';
import type { Round } from '@/lib/model/types';

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeRound(overrides: Partial<Round> = {}): Round {
  const now = Date.now();
  return {
    id: 'round_test_001',
    createdAt: now,
    updatedAt: now,
    role: 'aff',
    format: makeFormatByKey('policy'),
    meta: { tournament: 'Nationals', roundLabel: 'Round 1' },
    sheets: [
      { id: 'sheet_001', title: 'Case', group: 'case', order: 0 },
    ],
    nodes: [
      {
        id: 'node_001',
        sheetId: 'sheet_001',
        speechId: 'speech_001',
        parentId: null,
        order: 0,
        text: 'Solvency',
        statuses: [],
      },
    ],
    timers: {
      activeSpeechId: null,
      speechRemaining: null,
      running: false,
      prepRemaining: { aff: 480, neg: 480 },
      prepRunning: null,
    },
    ...overrides,
  };
}

// ─── exportRoundJSON ──────────────────────────────────────────────────────────

describe('exportRoundJSON', () => {
  it('returns a string', () => {
    const round = makeRound();
    const json = exportRoundJSON(round);
    expect(typeof json).toBe('string');
  });

  it('exported string contains "version": 1', () => {
    const round = makeRound();
    const json = exportRoundJSON(round);
    expect(json).toContain('"version": 1');
  });

  it('includes the round id in the exported string', () => {
    const round = makeRound({ id: 'round_export_test' });
    const json = exportRoundJSON(round);
    expect(json).toContain('round_export_test');
  });
});

// ─── importRoundJSON ──────────────────────────────────────────────────────────

describe('importRoundJSON', () => {
  it('round-trips: exportRoundJSON then importRoundJSON gives deep-equal Round', () => {
    const round = makeRound();
    const json = exportRoundJSON(round);
    const imported = importRoundJSON(json);
    expect(imported).toEqual(round);
  });

  it('throws "Invalid JSON" on garbage input', () => {
    expect(() => importRoundJSON('not valid json {')).toThrow('Invalid JSON');
  });

  it('throws "Invalid JSON" on empty string', () => {
    expect(() => importRoundJSON('')).toThrow('Invalid JSON');
  });

  it('throws "Unsupported file version" when version is 2', () => {
    const payload = JSON.stringify({ version: 2, round: makeRound() });
    expect(() => importRoundJSON(payload)).toThrow('Unsupported file version: 2');
  });

  it('throws "Unsupported file version" when version is 0', () => {
    const payload = JSON.stringify({ version: 0, round: makeRound() });
    expect(() => importRoundJSON(payload)).toThrow('Unsupported file version: 0');
  });

  it('throws "Invalid round file" when round field is missing', () => {
    const payload = JSON.stringify({ version: FILE_VERSION });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round is not an object', () => {
    const payload = JSON.stringify({ version: FILE_VERSION, round: 'string' });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.id is missing', () => {
    const { id: _id, ...roundNoId } = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: roundNoId });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.role is missing', () => {
    const { role: _role, ...roundNoRole } = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: roundNoRole });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.format is missing', () => {
    const { format: _format, ...roundNoFormat } = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: roundNoFormat });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.sheets is not an array', () => {
    const round = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: { ...round, sheets: 'bad' } });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.nodes is not an array', () => {
    const round = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: { ...round, nodes: null } });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.timers is missing', () => {
    const { timers: _timers, ...roundNoTimers } = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: roundNoTimers });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when round.meta is missing', () => {
    const { meta: _meta, ...roundNoMeta } = makeRound();
    const payload = JSON.stringify({ version: FILE_VERSION, round: roundNoMeta });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });

  it('throws "Invalid round file" when version field is not a number', () => {
    const payload = JSON.stringify({ version: '1', round: makeRound() });
    expect(() => importRoundJSON(payload)).toThrow('Invalid round file');
  });
});

// ─── readRoundFile (browser helper) ──────────────────────────────────────────
// jsdom provides File and Blob polyfills; File.text() is available in jsdom.

describe('readRoundFile', () => {
  it('reads a File containing a valid exported round and returns a deep-equal Round', async () => {
    const { readRoundFile } = await import('./io');
    const round = makeRound({ id: 'round_file_test' });
    const json = exportRoundJSON(round);
    const file = new File([json], 'debate-flow-aff-20240101.json', { type: 'application/json' });
    const imported = await readRoundFile(file);
    expect(imported).toEqual(round);
  });

  it('rejects when file contains invalid JSON', async () => {
    const { readRoundFile } = await import('./io');
    const file = new File(['garbage { not json'], 'bad.json', { type: 'application/json' });
    await expect(readRoundFile(file)).rejects.toThrow('Invalid JSON');
  });
});
