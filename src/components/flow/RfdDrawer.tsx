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
    "&": { height: "100%", fontSize: "13px", color: "inherit" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto", fontFamily: "inherit", lineHeight: "1.5" },
    ".cm-content": { padding: "10px 14px" },
});

export default function RfdDrawer() {
    const setRfdOpen = useFlowStore((s) => s.setRfdOpen);
    const hostRef = useRef<HTMLDivElement>(null);
    // Default to roughly a third of the viewport; dragging the handle resizes.
    const [height, setHeight] = useState(() =>
        typeof window === "undefined" ? 240 : Math.round(window.innerHeight * 0.3),
    );

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
        view.focus();
        return () => view.destroy();
    }, []);

    function startResize(e: React.PointerEvent) {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = height;
        const max = typeof window === "undefined" ? 800 : window.innerHeight * 0.8;
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
                <span className="text-muted-foreground font-mono text-[9px] font-bold tracking-widest uppercase">
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
