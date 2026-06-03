import { describe, it, expect } from 'vitest';
import {
  escXml, inlineCell, buildBodyRow, setCellInline,
  buildFlowSheetXml, registerSheets,
  parseColStyles, removeCalcChainFromRels,
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
  it('includes the s attribute when a column style is given', () => {
    const xml = inlineCell('A3', { text: 'hi', crossed: false, extended: false }, 41);
    expect(xml).toContain('s="41"');
    expect(xml).toContain('t="inlineStr"');
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
  it('applies column style index when colStyles are provided', () => {
    const byCol = new Map([[0, { text: 'hi', crossed: false, extended: false }]]);
    const colStyles = new Map([[0, 41]]);
    const row = buildBodyRow(3, byCol, colStyles);
    expect(row).toContain('s="41"');
  });
});

describe('parseColStyles', () => {
  const affXml = `<cols>
    <col min="1" max="1" width="21" style="41" customWidth="1"/>
    <col min="2" max="2" width="21" style="42" customWidth="1"/>
    <col min="3" max="3" width="21" style="41" customWidth="1"/>
    <col min="8" max="16384" width="10" style="38" hidden="1"/>
  </cols>`;
  it('maps 0-indexed column to its style index', () => {
    const styles = parseColStyles(affXml);
    expect(styles.get(0)).toBe(41); // col A
    expect(styles.get(1)).toBe(42); // col B
    expect(styles.get(2)).toBe(41); // col C
  });
  it('caps at col 25 so the catch-all range does not allocate 16k entries', () => {
    const styles = parseColStyles(affXml);
    expect(styles.size).toBeLessThan(30);
  });
});

describe('setCellInline', () => {
  it('replaces a self-closing cell with an inline-string cell, keeping its style', () => {
    const out = setCellInline('<c r="D11" s="83"/>', 'D11', 'Tourney');
    expect(out).toBe('<c r="D11" s="83" t="inlineStr"><is><t xml:space="preserve">Tourney</t></is></c>');
  });
});

describe('removeCalcChainFromRels', () => {
  it('removes the calcChain relationship entry', () => {
    const rels = `<Relationships><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/><Relationship Id="rId11" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>`;
    const out = removeCalcChainFromRels(rels);
    expect(out).not.toContain('calcChain');
    expect(out).toContain('rId11'); // other entries preserved
  });
  it('is a no-op when calcChain is not present', () => {
    const rels = '<Relationships><Relationship Id="rId1" Type="worksheet" Target="sheet1.xml"/></Relationships>';
    expect(removeCalcChainFromRels(rels)).toBe(rels);
  });
});

describe('buildFlowSheetXml', () => {
  const minAffXml = `<?xml version="1.0"?>
<worksheet xr:uid="{ABC-123}"><sheetPr codeName="Sheet2"/>
<cols><col min="1" max="1" width="21" style="41"/><col min="2" max="2" width="21" style="42"/></cols>
<sheetData>
  <row r="1"><c r="A1" s="112"/></row>
  <row r="2"><c r="A2" s="39" t="s"><v>0</v></c></row>
</sheetData>
<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
</worksheet>`;

  const es: ExportSheet = {
    sheet: { id: 'sh', title: 'K', group: 'aff', order: 0 },
    cells: [{ col: 0, speechName: '1AC', row: 0, text: 'Node', crossed: false, extended: false }],
    rowCount: 1,
  };

  it('strips the xr:uid to prevent duplicate-UID corruption in Excel', () => {
    const out = buildFlowSheetXml(minAffXml, es);
    expect(out).not.toContain('xr:uid=');
  });
  it('applies column style to generated body cells', () => {
    const out = buildFlowSheetXml(minAffXml, es);
    expect(out).toContain('s="41"'); // col A style
  });
  it('injects the sheet title into A1 and keeps row 2 headers', () => {
    const out = buildFlowSheetXml(minAffXml, es);
    expect(out).toContain('K'); // title
    expect(out).toContain('t="s"'); // row 2 shared-string headers preserved
  });
});
