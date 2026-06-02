/**
 * Maps the app's policy speech names onto the Flow.xltm template columns.
 * The AFF flow sheet has all 7 speech columns; the NEG flow sheet drops 1AC.
 */

export const AFF_COLUMNS = ['1AC', '1NC', '2AC', 'Block', '1AR', '2NR', '2AR'];
export const NEG_COLUMNS = ['1NC', '2AC', 'Block', '1AR', '2NR', '2AR'];

/** 0-based column index → Excel letter (A..G is all we need). */
export function colLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * 0-based template column for a speech name on the given side,
 * or -1 if that speech does not appear on that side's flow sheet.
 */
export function templateColumn(side: 'aff' | 'neg', speechName: string): number {
  const cols = side === 'aff' ? AFF_COLUMNS : NEG_COLUMNS;
  return cols.indexOf(speechName);
}
