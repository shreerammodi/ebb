/**
 * CodeMirror completion source for the RFD editor. Turns the flow's cells into
 * completions so a judge can drop the exact wording of any argument into their
 * RFD without retyping it. The cell index is reused from the search palette
 * (collectCells); CodeMirror's own fuzzy matcher does the filtering, ranking,
 * and matched-substring underlining.
 */

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import type { FlowRound } from "@/lib/model/flow";
import { collectCells } from "@/lib/search/cellSearch";

/** Every filled cell as a completion labelled by its text; side drives the ink. */
export function cellCompletions(round: FlowRound): Completion[] {
    return collectCells(round).map((cell) => ({
        label: cell.text,
        // Side (aff/neg) drives the leading dot and text color; the drawer keys
        // its theme off `type`.
        type: cell.side,
    }));
}

/**
 * A completion source that offers the round's cells. It fires automatically on
 * a markdown blockquote line (the judge's citation style), replacing the text
 * after the ">" marker on accept. On other lines it stays silent unless
 * explicitly invoked (Ctrl+Space), where it completes the current word.
 *
 * It returns every cell and lets CodeMirror filter, rank, and underline against
 * the typed text (default `filter: true`); `from` marks where that text starts.
 *
 * `getRound` is read on every invocation so the editor never needs
 * reconfiguring when the active round changes.
 */
export function makeCellCompletionSource(getRound: () => FlowRound | null) {
    return (context: CompletionContext): CompletionResult | null => {
        const round = getRound();
        if (!round) return null;

        const line = context.state.doc.lineAt(context.pos);
        const before = line.text.slice(0, context.pos - line.from);

        let from: number;
        const blockquote = /^\s*>\s?(.*)$/.exec(before);
        if (blockquote) {
            from = context.pos - blockquote[1].length;
        } else if (context.explicit) {
            const word = context.matchBefore(/\S*/);
            from = word ? word.from : context.pos;
        } else {
            return null;
        }

        const options = cellCompletions(round);
        if (options.length === 0) return null;
        return { from, to: context.pos, options };
    };
}
