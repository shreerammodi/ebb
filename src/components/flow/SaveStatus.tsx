"use client";

import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { Tip } from "@/components/ui/tooltip";
import { saveFlowNow } from "@/lib/persistence/flowPersistence";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";

/** Coarse "time since save" - exact enough for reassurance, never ticking seconds. */
function relTime(savedAt: number, now: number): string {
    const s = Math.max(0, Math.round((now - savedAt) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}

/**
 * The editor's quiet autosave indicator. Light-touch reassurance that a
 * backend-less, data-holding round is safe - and a loud-enough failure with a
 * retry, because a silent save failure is the one thing a flowing debater
 * cannot afford. Meaning is carried by text + icon, never color alone.
 */
export default function SaveStatus() {
    const state = useSaveStatus((s) => s.state);
    const savedAt = useSaveStatus((s) => s.savedAt);
    const report = useSaveStatus((s) => s.report);
    const [now, setNow] = useState(() => Date.now());

    // Keep the relative time fresh while a "Saved" timestamp is showing.
    useEffect(() => {
        if (state !== "saved" || savedAt == null) return;
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(t);
    }, [state, savedAt]);

    if (state === "idle") return null;

    if (state === "error") {
        return (
            <span
                role="alert"
                data-testid="save-status"
                data-state="error"
                className="text-warn flex flex-none items-center gap-1.5 text-xs font-medium"
            >
                <TriangleAlert size={13} aria-hidden="true" />
                Not saved
                <button
                    type="button"
                    data-testid="save-retry"
                    onClick={() => {
                        const round = useFlowStore.getState().round;
                        if (round) void saveFlowNow(round, report);
                    }}
                    className="rounded-sm underline underline-offset-2 hover:no-underline focus-visible:outline-2"
                >
                    Retry
                </button>
            </span>
        );
    }

    const saving = state === "saving";

    const indicator = (
        <span
            data-testid="save-status"
            data-state={state}
            tabIndex={savedAt ? 0 : undefined}
            className="text-muted-foreground flex flex-none items-center gap-1.5 text-xs select-none"
        >
            <AnimatePresence mode="wait" initial={false}>
                <m.span
                    key={saving ? "saving" : "saved"}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    className="flex items-center gap-1.5"
                >
                    {saving ? (
                        <LoaderCircle
                            aria-hidden="true"
                            className="text-muted-foreground size-3.5 motion-safe:animate-spin"
                        />
                    ) : (
                        <Check aria-hidden="true" className="text-good size-3.5" />
                    )}
                    <span className="hidden sm:inline">
                        {saving ? "Saving…" : `Saved${savedAt ? ` ${relTime(savedAt, now)}` : ""}`}
                    </span>
                </m.span>
            </AnimatePresence>
        </span>
    );

    if (!savedAt) return indicator;

    return <Tip label={`Last saved ${new Date(savedAt).toLocaleTimeString()}`}>{indicator}</Tip>;
}
