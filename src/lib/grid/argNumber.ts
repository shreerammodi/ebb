/**
 * Argument numbering: the "2AC #1", "2AC #2" markers a debater writes at the
 * head of each answer so the next speech can line up against them.
 *
 * A marker is written from a template holding two tokens, `%Speech%` for the
 * column's speech label and `%Number%` for the count. The tokens match in any
 * case. The template is written exactly as given, separator and spacing
 * included, except that one with no `%Number%` gets the count on the end, so
 * every marker carries a number to continue from.
 */

export const DEFAULT_ARG_MARKER = "%Speech% #%Number% ";

const TOKEN = /%(speech|number)%/gi;

/** The template a setting holds, or the default when it is left empty. */
function templateOf(template: string): string {
    const t = template.trim() ? template : DEFAULT_ARG_MARKER;
    return /%number%/i.test(t) ? t : `${t}%Number%`;
}

/** The marker text for argument `n` in a column labelled `speech`. */
export function formatArgMarker(template: string, speech: string, n: number): string {
    return templateOf(template).replace(TOKEN, (_, token: string) =>
        token.toLowerCase() === "speech" ? speech : String(n),
    );
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a marker at the start of a cell's text, capturing its number. */
function markerPattern(template: string, speech: string): RegExp {
    const parts = templateOf(template).split(TOKEN);
    // split with a capturing group alternates literal text and token names.
    const source = parts
        .map((part, i) => {
            if (i % 2 === 0) return escapeRegExp(part);
            return part.toLowerCase() === "speech" ? escapeRegExp(speech) : "(\\d+)";
        })
        .join("");
    // Spacing in the template is loose, so a hand-typed "2AC#3" still counts.
    return new RegExp(`^\\s*${source.replace(/\s+/g, "\\s*")}`, "i");
}

/**
 * How many leading characters of `text` are a marker, or 0 when it does not
 * open with one. This is what a second press replaces, so renumbering a cell
 * never stacks a new marker on the old.
 */
export function argMarkerLength(text: string, template: string, speech: string): number {
    return markerPattern(template, speech).exec(text)?.[0].length ?? 0;
}

/**
 * The number the next marker carries: one past the nearest marker above
 * `row` in `cells`, or 1 when nothing above holds one. The nearest wins
 * rather than the highest, so a debater who restarts the count partway down
 * a column continues from the restart.
 */
export function nextArgNumber(
    cells: readonly unknown[],
    row: number,
    template: string,
    speech: string,
): number {
    const pattern = markerPattern(template, speech);
    for (let r = Math.min(row, cells.length) - 1; r >= 0; r--) {
        const text = cells[r];
        if (typeof text !== "string") continue;
        const match = pattern.exec(text);
        if (match) return Number(match[1]) + 1;
    }
    return 1;
}
