"use client";

import { Check } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { flowCoachProgress } from "@/lib/guide/coachProgress";
import { loadCoachSeen, saveCoachSeen } from "@/lib/guide/coachSeen";
import { keyHintFor } from "@/lib/keymap/displayChord";
import type { ArgumentNode } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { cn } from "@/lib/utils";

const NO_NODES: ArgumentNode[] = [];

interface Step {
    n: number;
    label: string;
    cmd?: "node.response";
    hint: string;
}

const STEPS: Step[] = [
    { n: 1, label: "Type your first argument", hint: "in the opening speech" },
    { n: 2, label: "Answer it", cmd: "node.response", hint: "drops a response in the next speech" },
    {
        n: 3,
        label: "Answer the answer",
        cmd: "node.response",
        hint: "now it reads across three speeches",
    },
];

/**
 * FlowCoach — a non-blocking first-run coach docked in the editor.
 *
 * Walks a brand-new user through building one argument that reads left-to-right
 * across speeches — the moment a flow "takes shape". Steps check off live as the
 * user performs each move; nothing is gated, and Skip/Got it end it for good.
 * Shown once per device (see {@link "@/lib/guide/coachSeen"}).
 */
export default function FlowCoach() {
    const nodes = useRoundStore((s) => s.round?.nodes ?? NO_NODES);
    const [active, setActive] = useState(false);
    const decided = useRef(false);

    // Decide once, at mount: only coach a brand-new, still-empty flow.
    useEffect(() => {
        if (decided.current) return;
        decided.current = true;
        const anyText = nodes.some((n) => n.text.trim().length > 0);
        if (!loadCoachSeen() && !anyText) setActive(true);
    }, [nodes]);

    const progress = flowCoachProgress(nodes);
    const done = progress.completed === 3;

    // Persist completion the moment it happens so a reload never reopens it,
    // but keep the success note visible until the user acknowledges it.
    useEffect(() => {
        if (active && done) saveCoachSeen(true);
    }, [active, done]);

    if (!active) return null;

    function dismiss() {
        saveCoachSeen(true);
        setActive(false);
    }

    const respKey = keyHintFor("node.response");

    return (
        <aside
            role="region"
            aria-label="First-run guide"
            data-testid="flow-coach"
            className="flow-coach border-border bg-card fixed right-4 bottom-4 z-40 w-[300px] max-w-[calc(100vw_-_2rem)] rounded-lg border p-3.5 shadow-lg"
        >
            {done ? (
                <div>
                    <div className="mb-1 flex items-center gap-1.5">
                        <Check weight="bold" className="text-sel size-4" />
                        <h2 className="text-foreground text-[13px] font-semibold">
                            That&rsquo;s a flow taking shape.
                        </h2>
                    </div>
                    <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                        One argument now reads left-to-right across speeches. Keep going — press{" "}
                        {keyHintFor("help.open") ? (
                            <Kbd>{keyHintFor("help.open")}</Kbd>
                        ) : (
                            "the help key"
                        )}{" "}
                        anytime for the full guide.
                    </p>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            data-testid="flow-coach-done"
                            onClick={dismiss}
                            className="focus-visible:ring-ring/50 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-2.5 py-1 text-[12px] font-medium outline-none focus-visible:ring-[3px]"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <h2 className="text-foreground text-[13px] font-semibold">
                            Flow your first exchange
                        </h2>
                        <button
                            type="button"
                            data-testid="flow-coach-skip"
                            onClick={dismiss}
                            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -mr-1 rounded px-1 text-[12px] outline-none focus-visible:ring-[3px]"
                        >
                            Skip
                        </button>
                    </div>
                    <ol className="space-y-2" aria-live="polite">
                        {STEPS.map((step) => {
                            const isDone = progress.completed >= step.n;
                            const isActive = progress.activeStep === step.n;
                            const key = step.cmd ? respKey : null;
                            return (
                                <li
                                    key={step.n}
                                    data-testid={`flow-coach-step-${step.n}`}
                                    data-state={isDone ? "done" : isActive ? "active" : "pending"}
                                    className="flex gap-2.5"
                                >
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "coach-marker mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                                            isDone
                                                ? "bg-sel text-white"
                                                : isActive
                                                  ? "border-sel text-sel border"
                                                  : "border-border text-muted-foreground border",
                                        )}
                                    >
                                        {isDone ? (
                                            <Check weight="bold" className="size-2.5" />
                                        ) : (
                                            step.n
                                        )}
                                    </span>
                                    <div className="min-w-0">
                                        <p
                                            className={cn(
                                                "text-[12.5px] leading-tight",
                                                isDone
                                                    ? "text-muted-foreground line-through"
                                                    : isActive
                                                      ? "text-foreground font-medium"
                                                      : "text-foreground",
                                            )}
                                        >
                                            {step.label}
                                            {key && (
                                                <>
                                                    {" "}
                                                    <Kbd>{key}</Kbd>
                                                </>
                                            )}
                                        </p>
                                        {isActive && (
                                            <p className="text-muted-foreground mt-0.5 text-[11.5px] leading-tight">
                                                {step.hint}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}
        </aside>
    );
}
