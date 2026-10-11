"use client";

import { X } from "@phosphor-icons/react";
import { useState } from "react";

import { Tip } from "@/components/ui/tooltip";
import { useFlowStore } from "@/lib/store/useFlowStore";

import RfdEditor, { RfdModeTabs, type RfdMode } from "./RfdEditor";

export default function RfdDrawer() {
    const setRfdOpen = useFlowStore((s) => s.setRfdOpen);
    // Default to roughly a third of the viewport; dragging the handle resizes.
    const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.3));
    // Transient per-mount; the drawer always opens in edit mode.
    const [mode, setMode] = useState<RfdMode>("edit");

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
                <div className="flex items-center gap-2">
                    <RfdModeTabs mode={mode} onChange={setMode} />
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
            </div>
            <RfdEditor mode={mode} />
        </section>
    );
}
