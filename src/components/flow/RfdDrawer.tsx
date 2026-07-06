"use client";

import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { githubDark } from "@fsegurai/codemirror-theme-github-dark";
import { githubLight } from "@fsegurai/codemirror-theme-github-light";
import { vim } from "@replit/codemirror-vim";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Tip } from "@/components/ui/tooltip";
import { focusActiveHot } from "@/lib/grid/hotInstance";
import { makeCellCompletionSource } from "@/lib/rfd/cellCompletion";
import { useFlowStore } from "@/lib/store/useFlowStore";

/**
 * Structural tweaks over the GitHub theme, which owns the editor and the
 * completion popup. Strips the popup's border and chrome to a bare list (it is
 * a tool, not a card), marks each option with a side-colored dot in the icon
 * slot, and inks the whole option aff blue / neg red to match the grid.
 * Applied after the theme so these selectors win.
 */
const rfdTheme = EditorView.theme({
    "&": { height: "100%", fontSize: "14px" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto", fontFamily: "inherit", lineHeight: "1.5" },
    ".cm-content": { padding: "10px 14px" },
    ".cm-tooltip.cm-tooltip-autocomplete": {
        border: "none",
        borderRadius: "0",
        backgroundColor: "var(--popover)",
        boxShadow: "none",
        padding: "0",
    },
    ".cm-tooltip-autocomplete > ul": {
        border: "none",
        fontFamily: "inherit",
        fontSize: "13px",
        maxHeight: "16em",
    },
    ".cm-tooltip-autocomplete > ul > li": {
        padding: "2px 8px",
        color: "var(--popover-foreground)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
    },
    // CodeMirror underlines the matched substring; make it clearly the query.
    ".cm-completionMatchedText": { textDecoration: "underline", fontWeight: "600" },
    // The icon slot holds a bare side-colored dot instead of a code-symbol glyph.
    ".cm-completionIcon": { paddingRight: "8px", opacity: "1" },
    ".cm-completionIcon-aff::after, .cm-completionIcon-neg::after": {
        content: '""',
        display: "inline-block",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        verticalAlign: "middle",
    },
    ".cm-completionIcon-aff::after": { backgroundColor: "var(--aff)" },
    ".cm-completionIcon-neg::after": { backgroundColor: "var(--neg)" },
    // Scoped to the row so the side ink outweighs the default option color above.
    ".cm-tooltip-autocomplete > ul > li.cm-rfd-aff": { color: "var(--aff)" },
    ".cm-tooltip-autocomplete > ul > li.cm-rfd-neg": { color: "var(--neg)" },
});

/**
 * Tracks the resolved appearance off the `.dark` class on <html>, the single
 * source of truth useThemeSync maintains, so it covers both the manual setting
 * and live OS changes under "system".
 */
function useIsDark(): boolean {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
    useEffect(() => {
        const el = document.documentElement;
        const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
        obs.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => obs.disconnect();
    }, []);
    return dark;
}

export default function RfdDrawer() {
    const setRfdOpen = useFlowStore((s) => s.setRfdOpen);
    const hostRef = useRef<HTMLDivElement>(null);
    // Default to roughly a third of the viewport; dragging the handle resizes.
    const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.3));

    const isDark = useIsDark();
    const rfdVim = useFlowStore((s) => s.rfdVim);
    const viewRef = useRef<EditorView | null>(null);
    // Swaps the GitHub light/dark theme in place without rebuilding the editor.
    const themeComp = useRef(new Compartment());
    // Swaps vim keybindings on/off in place without rebuilding the editor.
    const vimComp = useRef(new Compartment());

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const source = makeCellCompletionSource(() => useFlowStore.getState().round);
        const view = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: useFlowStore.getState().round?.scouting.decision?.rfd ?? "",
                extensions: [
                    // Vim's keymap must precede the default keymaps so it wins;
                    // read at mount from the store to avoid a stale closure.
                    vimComp.current.of(
                        useFlowStore.getState().rfdVim ? vim({ status: true }) : [],
                    ),
                    history(),
                    drawSelection(),
                    EditorView.lineWrapping,
                    markdown(),
                    themeComp.current.of(
                        document.documentElement.classList.contains("dark")
                            ? githubDark
                            : githubLight,
                    ),
                    autocompletion({
                        override: [source],
                        activateOnTyping: true,
                        // The icon slot renders the side dot; optionClass inks the row.
                        icons: true,
                        optionClass: (c) => (c.type ? `cm-rfd-${c.type}` : ""),
                    }),
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
        viewRef.current = view;
        // Defer focus past the current keydown (the Meta+j that opened the
        // drawer) so the grid's focus handling cannot reclaim it.
        const focusRaf = requestAnimationFrame(() => view.focus());
        return () => {
            cancelAnimationFrame(focusRaf);
            view.destroy();
            viewRef.current = null;
            // Closing hands keyboard focus back to the grid so the next
            // keystroke edits the flow instead of falling on <body>.
            focusActiveHot();
        };
    }, []);

    useEffect(() => {
        viewRef.current?.dispatch({
            effects: themeComp.current.reconfigure(isDark ? githubDark : githubLight),
        });
    }, [isDark]);

    useEffect(() => {
        viewRef.current?.dispatch({
            effects: vimComp.current.reconfigure(rfdVim ? vim({ status: true }) : []),
        });
    }, [rfdVim]);

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
                <span className="text-foreground text-[13px] font-semibold tracking-wide">RFD</span>
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
