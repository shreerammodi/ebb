"use client";

import { useMemo } from "react";
import type { RoundSummary } from "@/lib/dashboard/summary";
import { relativeTime, resultLabel } from "./format";
import { toSegments } from "@/lib/search/fuzzy";
import { cn } from "@/lib/utils";

const rolePill: Record<RoundSummary["role"], { label: string; cls: string }> = {
    aff: { label: "Aff", cls: "bg-blue-50 text-blue-600" },
    neg: { label: "Neg", cls: "bg-red-50 text-red-600" },
    judge: { label: "Judge", cls: "bg-zinc-100 text-zinc-500" },
};

export interface FlowCardProps {
    summary: RoundSummary;
    onOpen: (id: string) => void;
    /** Optional kebab menu element rendered top-right. */
    menu?: React.ReactNode;
    /** Optional snippet (already segmented) shown when a content match exists. */
    snippet?: ReturnType<typeof toSegments> | null;
}

export default function FlowCard({
    summary,
    onOpen,
    menu,
    snippet,
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

    return (
        <div
            data-testid={`flow-card-${summary.id}`}
            onClick={() => onOpen(summary.id)}
            className="group relative cursor-pointer rounded-xl border border-border bg-card p-5 transition hover:-translate-y-px hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
        >
            {menu}
            <div className="flex items-center justify-between gap-2">
                <span className="pr-7 text-[15px] font-semibold tracking-tight text-pretty">
                    <span
                        className={cn(
                            affBlank ? "text-zinc-400 italic" : "text-blue-600",
                        )}
                    >
                        {aff}
                    </span>
                    <span className="px-1.5 text-[13px] font-normal text-zinc-400">
                        vs
                    </span>
                    <span
                        className={cn(
                            negBlank ? "text-zinc-400 italic" : "text-red-600",
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
                <span className="text-zinc-400">Tournament</span>
                <span className={summary.tournament ? "" : "text-zinc-400"}>
                    {summary.tournament ?? "—"}
                </span>
                <span className="text-zinc-400">Round</span>
                <span className={summary.round ? "" : "text-zinc-400"}>
                    {summary.round ?? "—"}
                </span>
                <span className="text-zinc-400">Judge</span>
                <span className={summary.judge ? "" : "text-zinc-400"}>
                    {summary.judge ?? "—"}
                </span>
                <span className="text-zinc-400">Result</span>
                <span
                    className={cn(
                        "font-semibold",
                        r.side === "aff" && "text-blue-600",
                        r.side === "neg" && "text-red-600",
                        r.side === null && "font-normal text-zinc-400",
                    )}
                >
                    {r.text}
                </span>
            </div>

            {snippet && (
                <p className="mt-3 line-clamp-2 text-[12px] text-zinc-500">
                    {snippet.map((seg, i) => (
                        <span
                            key={i}
                            className={
                                seg.match
                                    ? "bg-yellow-100 font-medium text-zinc-800"
                                    : ""
                            }
                        >
                            {seg.text}
                        </span>
                    ))}
                </p>
            )}

            <hr className="-mx-5 my-3 border-zinc-100" />
            <div className="text-[12px] text-zinc-500">edited {edited}</div>
        </div>
    );
}
