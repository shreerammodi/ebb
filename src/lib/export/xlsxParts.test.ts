import { describe, it, expect } from 'vitest';
import {
  escXml, inlineCell, buildBodyRow, setCellInline,
  buildFlowSheetXml, registerSheets, toWorkbookContentType,
} from './xlsxParts';
import type { ExportSheet } from './cells';

describe('escXml', () => {
  it('escapes XML metacharacters', () => {
    expect(escXml('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; &quot;d&quot;');
  });
});

describe('inlineCell', () => {
  it('emits an inline-string cell', () => {
    expect(inlineCell('A3', { text: 'hi', crossed: false, extended: false }))
      .toContain('<c r="A3" t="inlineStr">');
  });
  it('wraps crossed text in a strike run and prefixes extended with an arrow', () => {
    const xml = inlineCell('B3', { text: 'x', crossed: true, extended: true });
    expect(xml).toContain('<strike/>');
    expect(xml).toContain('→ x');
  });
});

describe('buildBodyRow', () => {
  it('omits empty columns and emits only filled cells', () => {
    const byCol = new Map([[2, { text: 'y', crossed: false, extended: false }]]);
    const row = buildBodyRow(5, byCol);
    expect(row).toContain('<row r="5">');
    expect(row).toContain('r="C5"');
    expect(row).not.toContain('r="A5"');
  });
});

describe('setCellInline', () => {
  it('replaces a self-closing cell with an inline-string cell, keeping its style', () => {
    const out = setCellInline('<c r="D11" s="83"/>', 'D11', 'Tourney');
    expect(out).toBe('<c r="D11" s="83" t="inlineStr"><is><t xml:space="preserve">Tourney</t></is></c>');
  });
});

describe('toWorkbookContentType', () => {
  it('flips the macro template main type to the macro workbook type', () => {
    const ct = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.template.macroEnabled.main+xml"/>';
    expect(toWorkbookContentType(ct)).toContain('application/vnd.ms-excel.sheet.macroEnabled.main+xml');
  });
});
