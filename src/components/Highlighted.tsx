import { toSegments } from "@/lib/search/fuzzy";

/** Renders text with matched character runs wrapped in <mark>. */
export function Highlighted({ text, ranges }: { text: string; ranges: number[] }) {
    const segments = toSegments(text, ranges);
    const hasHighlight = segments.some((s) => s.match);

    // When there's no highlight, render a plain span so getByText("...") finds it
    // as a single leaf element with a direct text node.
    if (!hasHighlight) {
        return <span>{text}</span>;
    }

    // When there are highlights, put the full text in a sr-only span (for
    // Testing Library / screen readers) and the visual mark-wrapped version
    // alongside it, hidden from the accessibility tree.
    return (
        <span>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true" className="contents">
                {segments.map((seg, i) =>
                    seg.match ? (
                        <mark key={i} className="text-foreground bg-transparent font-semibold">
                            {seg.text}
                        </mark>
                    ) : (
                        <span key={i}>{seg.text}</span>
                    ),
                )}
            </span>
        </span>
    );
}
