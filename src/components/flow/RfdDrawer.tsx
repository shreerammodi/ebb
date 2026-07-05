"use client";

import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Tip } from "@/components/ui/tooltip";
import { makeCellCompletionSource } from "@/lib/rfd/cellCompletion";
import { useFlowStore } from "@/lib/store/useFlowStore";

/** Inherit the app's fonts/colors; CodeMirror's chrome stays transparent. */
const rfdTheme = EditorView.theme({
    "&": { height: "100%", fontSize: "14px", color: "inherit" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto", fontFamily: "inherit", lineHeight: "1.5" },
    // Caret follows the theme ink (light on dark, dark on light) so it stays
    // visible in dark mode, where CodeMirror's default dark caret vanishes.
    ".cm-content": { padding: "10px 14px", caretColor: "var(--foreground)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    // Match the completion popup to the app's menu tokens so it stays legible
    // in both themes; CodeMirror's default popup is light-only.
    ".cm-tooltip.cm-tooltip-autocomplete": {
        border: "1px solid var(--border)",
        borderRadius: "8px",
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        boxShadow: "0 10px 30px oklch(0 0 0 / 0.25)",
        overflow: "hidden",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
        fontFamily: "inherit",
        fontSize: "13px",
        maxHeight: "16rem",
        padding: "4px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
        padding: "4px 10px",
        borderRadius: "6px",
        lineHeight: "1.5",
        color: "var(--foreground)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--foreground)",
    },
    ".cm-completionDetail": {
        marginLeft: "0.75rem",
        color: "var(--muted-foreground)",
        fontStyle: "italic",
    },
    ".cm-completionMatchedText": {
        textDecoration: "none",
        fontWeight: "600",
        color: "inherit",
    },
    // Each option carries its speech's side (via the completion `type`): a
    // colored dot plus aff/neg ink on the label, matching the grid so the
    // reference reads as the same argument. The speech name stays muted italic.
    ".cm-completionIcon-aff, .cm-completionIcon-neg": {
        width: "1.1em",
        paddingRight: "0.4em",
        opacity: "1",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    },
    ".cm-completionIcon-aff::after, .cm-completionIcon-neg::after": {
        content: '""',
        display: "block",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
    },
    ".cm-completionIcon-aff::after": { backgroundColor: "var(--aff)" },
    ".cm-completionIcon-neg::after": { backgroundColor: "var(--neg)" },
    ".cm-completionIcon-aff ~ .cm-completionLabel": { color: "var(--aff)" },
    ".cm-completionIcon-neg ~ .cm-completionLabel": { color: "var(--neg)" },
});

export default function RfdDrawer() {
    const setRfdOpen = useFlowStore((s) => s.setRfdOpen);
    const hostRef = useRef<HTMLDivElement>(null);
    // Default to roughly a third of the viewport; dragging the handle resizes.
    const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.3));

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const source = makeCellCompletionSource(() => useFlowStore.getState().round);
        const view = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: useFlowStore.getState().round?.scouting.decision?.rfd ?? "",
                extensions: [
                    history(),
                    drawSelection(),
                    EditorView.lineWrapping,
                    markdown(),
                    syntaxHighlighting(defaultHighlightStyle),
                    autocompletion({ override: [source], activateOnTyping: true }),
                    keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
                    rfdTheme,
                    EditorView.updateListener.of((u) => {
                        if (!u.docChanged) return;
                        const { round, setScouting } = useFlowStore.getState();
                        if (!round) return;
                        setScouting({
                            decision: { ...round.scouting.decision, rfd: u.state.doc.toString() },
                        });
                    }),
                ],
            }),
        });
        // Defer focus past the current keydown (the Meta+j that opened the
        // drawer) so the grid's focus handling cannot reclaim it.
        const focusRaf = requestAnimationFrame(() => view.focus());
        return () => {
            cancelAnimationFrame(focusRaf);
            view.destroy();
        };
    }, []);

    function startResize(e: React.PointerEvent) {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = height;
        const max = window.innerHeight * 0.8;
        function onMove(ev: PointerEvent) {
            // Dragging up (smaller clientY) grows the drawer.
            setHeight(Math.max(120, Math.min(max, startHeight + (startY - ev.clientY))));
        }
        function onUp() {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }

    return (
        <section
            data-testid="rfd-drawer"
            aria-label="RFD"
            className="no-print border-border bg-card flex flex-none flex-col border-t"
            style={{ height }}
        >
            <div
                role="separator"
                aria-label="Resize RFD drawer"
                onPointerDown={startResize}
                className="hover:bg-accent h-1 flex-none cursor-row-resize"
            />
            <div className="border-border flex items-center justify-between border-b px-3.5 py-2">
                <span className="text-foreground text-[13px] font-semibold tracking-wide">
                    RFD
                </span>
                <Tip label="Close">
                    <button
                        type="button"
                        aria-label="Close RFD"
                        data-testid="rfd-close"
                        onClick={() => setRfdOpen(false)}
                        className="text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-2"
                    >
                        <X className="size-4" />
                    </button>
                </Tip>
            </div>
            <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
        </section>
    );
}
