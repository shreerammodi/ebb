/**
 * CodeMirror completion source for the RFD editor. Turns the flow's cells into
 * completions so a judge can drop the exact wording of any argument into their
 * RFD without retyping it. The cell index and fuzzy ranking are reused from the
 * search palette (searchCells); this only adapts them to CodeMirror.
 */

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import type { FlowRound } from "@/lib/model/flow";
import { searchCells } from "@/lib/search/cellSearch";

/** Cells matching `query`, as CodeMirror completions labelled by cell text. */
export function cellCompletions(round: FlowRound, query: string): Completion[] {
    return searchCells(round, query).map((hit) => ({
        label: hit.text,
        // The speech the line was said in (e.g. "2NR"), for context.
        detail: hit.colName || undefined,
    }));
}

/**
 * A completion source that offers the round's cells. It fires automatically on
 * a markdown blockquote line (the judge's citation style), using the text after
 * the ">" marker as the query and replacing just that text on accept. On other
 * lines it stays silent unless explicitly invoked (Ctrl+Space), where it
 * completes the current word.
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

        let query: string;
        let from: number;
        const blockquote = /^\s*>\s?(.*)$/.exec(before);
        if (blockquote) {
            query = blockquote[1];
            from = context.pos - query.length;
        } else if (context.explicit) {
            const word = context.matchBefore(/\S*/);
            query = word ? word.text : "";
            from = word ? word.from : context.pos;
        } else {
            return null;
        }

        const options = cellCompletions(round, query);
        if (options.length === 0) return null;
        // searchCells already fuzzy-filtered; keep every option in rank order.
        return { from, to: context.pos, options, filter: false };
    };
}
