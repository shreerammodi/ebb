"use client";

import { useMemo } from "react";
import type { RoundSummary } from "@/lib/dashboard/summary";
import { relativeTime, resultLabel } from "./format";
import { toSegments } from "@/lib/search/fuzzy";
import { cn } from "@/lib/utils";

const rolePill: Record<RoundSummary["role"], { label: string; cls: string }> = {
    aff: { label: "Aff", cls: "bg-aff/10 text-aff" },
    neg: { label: "Neg", cls: "bg-neg/10 text-neg" },
    judge: { label: "Judge", cls: "bg-zinc-100 text-muted-foreground" },
};

export interface FlowCardProps {
    summary: RoundSummary;
    onOpen: (id: string) => void;
    /** Optional kebab menu element rendered top-right. */
    menu?: React.ReactNode;
    /** Optional snippet (already segmented) shown when a content match exists. */
    snippet?: ReturnType<typeof toSegments> | null;
    /**
     * Whether the card opens a flow on click/Enter. False for read-only
     * contexts (e.g. Trash) so it isn't announced as an actionable button.
     */
    interactive?: boolean;
}

export default function FlowCard({
    summary,
    onOpen,
    menu,
    snippet,
    interactive = true,
}: FlowCardProps) {
    const r = resultLabel(summary.decision);
    const edited = useMemo(
        () => relativeTime(summary.updatedAt),
        [summary.updatedAt],
    );
    const pill = rolePill[summary.role];

    const aff = summary.affTeam || "Untitled Aff";
    const neg = summary.negTeam || "Untitled Neg";
    const affBlank = !summary.affTeam;
    const negBlank = !summary.negTeam;

    const interactiveProps = interactive
        ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-label": `Open ${aff} vs ${neg}`,
              onClick: () => onOpen(summary.id),
              onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(summary.id);
                  }
              },
          }
        : {};

    return (
        <div
            data-testid={`flow-card-${summary.id}`}
            {...interactiveProps}
            className={cn(
                "group relative rounded-lg border border-border bg-card p-5 transition-colors",
                interactive &&
                    "cursor-pointer hover:border-zinc-400 hover:bg-accent/40",
            )}
        >
            {menu}
            <div className="flex items-center justify-between gap-2">
                <span className="pr-7 text-[15px] font-semibold tracking-tight text-pretty">
                    <span
                        className={cn(
                            affBlank
                                ? "text-muted-foreground italic"
                                : "text-aff",
                        )}
                    >
                        {aff}
                    </span>
                    <span className="px-1.5 text-[13px] font-normal text-muted-foreground">
                        vs
                    </span>
                    <span
                        className={cn(
                            negBlank
                                ? "text-muted-foreground italic"
                                : "text-neg",
                        )}
                    >
                        {neg}
                    </span>
                </span>
                <span
                    className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                        pill.cls,
                    )}
                >
                    {pill.label}
                </span>
            </div>

            <hr className="-mx-5 my-3 border-zinc-100" />

            <div className="grid grid-cols-[78px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                <span className="text-muted-foreground">Tournament</span>
                <span
                    className={
                        summary.tournament ? "" : "text-muted-foreground"
                    }
                >
                    {summary.tournament ?? "—"}
                </span>
                <span className="text-muted-foreground">Round</span>
                <span className={summary.round ? "" : "text-muted-foreground"}>
                    {summary.round ?? "—"}
                </span>
                <span className="text-muted-foreground">Judge</span>
                <span className={summary.judge ? "" : "text-muted-foreground"}>
                    {summary.judge ?? "—"}
                </span>
                <span className="text-muted-foreground">Result</span>
                <span
                    className={cn(
                        "font-semibold",
                        r.side === "aff" && "text-aff",
                        r.side === "neg" && "text-neg",
                        r.side === null && "font-normal text-muted-foreground",
                    )}
                >
                    {r.text}
                </span>
            </div>

            {snippet && (
                <p className="mt-3 line-clamp-2 text-[12px] text-muted-foreground">
                    {snippet.map((seg, i) => (
                        <span
                            key={i}
                            className={
                                seg.match ? "font-semibold text-foreground" : ""
                            }
                        >
                            {seg.text}
                        </span>
                    ))}
                </p>
            )}

            <hr className="-mx-5 my-3 border-zinc-100" />
            <div className="text-[12px] text-muted-foreground">
                edited {edited}
            </div>
        </div>
    );
}
