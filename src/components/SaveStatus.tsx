"use client";

import { useEffect, useState } from "react";

import { saveRoundNow } from "@/lib/persistence/autosave";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";
import { Tip } from "@/components/ui/tooltip";

/** Coarse "time since save" — exact enough for reassurance, never ticking seconds. */
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
 * backend-less, data-holding round is safe — and a loud-enough failure with a
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
                className="text-warn flex items-center gap-1.5 text-xs font-medium"
            >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                        d="M8 1.5 15 14H1L8 1.5Z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M8 6.5v3.2"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                    />
                    <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
                </svg>
                Not saved
                <button
                    type="button"
                    data-testid="save-retry"
                    onClick={() => {
                        const round = useRoundStore.getState().round;
                        if (round) void saveRoundNow(round, report);
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
            className="text-muted-foreground flex items-center gap-1.5 text-xs select-none"
        >
            <span
                aria-hidden="true"
                className={
                    saving
                        ? "bg-muted-foreground h-1.5 w-1.5 rounded-full motion-safe:animate-pulse"
                        : "bg-good h-1.5 w-1.5 rounded-full"
                }
            />
            {saving ? "Saving…" : `Saved${savedAt ? ` ${relTime(savedAt, now)}` : ""}`}
        </span>
    );

    if (!savedAt) return indicator;

    return <Tip label={`Last saved ${new Date(savedAt).toLocaleTimeString()}`}>{indicator}</Tip>;
}
