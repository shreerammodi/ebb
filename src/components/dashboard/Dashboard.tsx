"use client";

import { Gear } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import GuideDialog from "@/components/guide/GuideDialog";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { filterFlows } from "@/lib/dashboard/filter";
import { sortSummaries, groupByTournament, type SortKey } from "@/lib/dashboard/organize";
import { keyHintFor } from "@/lib/keymap/displayChord";
import { listRounds, type RoundSummary } from "@/lib/persistence/autosave";
import { loadSearchIndex, backfillSearchIndex } from "@/lib/persistence/searchIndex";
import { useRoundStore } from "@/lib/store/useRoundStore";

import FlowCard from "./FlowCard";
import FlowCardMenu from "./FlowCardMenu";
import FlowDetailDrawer from "./FlowDetailDrawer";
import ImportExportControls from "./ImportExportControls";
import NewFlowButton from "./NewFlowButton";
import { useCreateFlow } from "./useCreateFlow";

export default function Dashboard() {
    const router = useRouter();
    const [summaries, setSummaries] = useState<RoundSummary[] | null>(null);
    const [index, setIndex] = useState<Map<string, string>>(new Map());
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("updated");
    const [grouped, setGrouped] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);

    const createFlow = useCreateFlow();

    const refresh = useCallback(async () => {
        await backfillSearchIndex();
        const [list, idx] = await Promise.all([listRounds(), loadSearchIndex()]);
        setSummaries(list);
        setIndex(idx);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const open = useCallback((id: string) => router.push(`/flow?id=${id}`), [router]);

    const matches = useMemo(
        () => filterFlows(summaries ?? [], index, query),
        [summaries, index, query],
    );
    const sorted = useMemo(() => {
        if (query.trim()) return matches;
        const order = sortSummaries(
            matches.map((m) => m.summary),
            sort,
        );
        const byId = new Map(matches.map((m) => [m.summary.id, m]));
        return order.map((s) => byId.get(s.id)!);
    }, [matches, sort, query]);

    const groups = useMemo(
        () => (grouped ? groupByTournament(sorted.map((m) => m.summary)) : null),
        [grouped, sorted],
    );

    if (summaries === null) {
        // Held frame, not a blank screen: the chrome stays put and card
        // placeholders pulse in, so the load never reads as "lost my flows".
        return (
            <div className="min-h-screen bg-zinc-50">
                <div className="border-border bg-card flex items-center gap-3 border-b px-5 py-4">
                    <Logo className="text-foreground h-5 w-auto" />
                    <Skeleton className="h-9 w-[360px]" />
                </div>
                <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-[168px] rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    const empty = summaries.length === 0;

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="border-border bg-card flex items-center gap-3 border-b px-5 py-4">
                <Logo className="text-foreground h-5 w-auto" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search flows…"
                    className="h-9 max-w-[360px]"
                    data-testid="dashboard-search"
                />
                <div className="flex-1" />
                <ImportExportControls onChanged={refresh} />
                <Link
                    href="/trash"
                    className="text-muted-foreground hover:text-foreground text-[13px]"
                    data-testid="dashboard-trash-link"
                >
                    Trash
                </Link>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Settings"
                    data-testid="dashboard-settings"
                    onClick={() => useRoundStore.getState().setSettingsOpen(true)}
                >
                    <Gear weight="bold" className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Guide"
                    data-testid="dashboard-guide"
                    onClick={() => useRoundStore.getState().setGuideOpen(true)}
                >
                    Guide
                </Button>
                <NewFlowButton />
            </div>

            <div className="px-5 py-5">
                {empty ? (
                    <div
                        data-testid="dashboard-empty"
                        className="mx-auto mt-24 flex max-w-md flex-col items-center gap-6 text-center"
                    >
                        <div className="space-y-1.5">
                            <h1 className="text-foreground text-lg font-semibold tracking-tight text-balance">
                                Flow your first round
                            </h1>
                            <p className="text-muted-foreground text-[13px] leading-relaxed text-pretty">
                                Ebb is a keyboard-first flow sheet. Pick a side to start —
                                everything stays on this device.
                            </p>
                        </div>

                        <div className="flex flex-col items-center gap-2.5">
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    data-testid="empty-start-aff"
                                    onClick={() => createFlow("aff")}
                                    className="border-input bg-card text-foreground hover:border-ring hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-medium outline-none focus-visible:ring-[3px]"
                                >
                                    <span className="bg-aff size-2 rounded-full" aria-hidden />
                                    Aff
                                </button>
                                <button
                                    type="button"
                                    data-testid="empty-start-neg"
                                    onClick={() => createFlow("neg")}
                                    className="border-input bg-card text-foreground hover:border-ring hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-medium outline-none focus-visible:ring-[3px]"
                                >
                                    <span className="bg-neg size-2 rounded-full" aria-hidden />
                                    Neg
                                </button>
                            </div>
                            <button
                                type="button"
                                data-testid="empty-start-judge"
                                onClick={() => createFlow("judge")}
                                className="text-muted-foreground hover:text-foreground text-[12.5px] outline-none focus-visible:underline"
                            >
                                or start as Judge
                            </button>
                        </div>

                        <div className="border-border/70 text-muted-foreground flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-5 text-[12px]">
                            <span className="inline-flex items-center gap-1.5">
                                <Kbd>↑ ↓ ← →</Kbd> move
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Kbd>type</Kbd> to flow an argument
                            </span>
                            {keyHintFor("node.response") && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Kbd>{keyHintFor("node.response")}</Kbd> to answer
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            data-testid="empty-open-guide"
                            onClick={() => useRoundStore.getState().setGuideOpen(true)}
                            className="text-muted-foreground hover:text-foreground text-[12.5px] underline-offset-2 outline-none hover:underline focus-visible:underline"
                        >
                            New to Ebb? Read the guide
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="text-muted-foreground mb-4 flex items-center gap-4 text-[12.5px]">
                            <span data-testid="flow-count">{summaries.length} flows</span>
                            <div className="flex-1" />
                            <label className="flex items-center gap-2">
                                Sort
                                <select
                                    value={sort}
                                    onChange={(e) => setSort(e.target.value as SortKey)}
                                    data-testid="sort-select"
                                    className="border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border px-2 py-1 outline-none focus-visible:ring-[3px]"
                                >
                                    <option value="updated">Last edited</option>
                                    <option value="date">Date</option>
                                    <option value="tournament">Tournament</option>
                                    <option value="result">Result</option>
                                </select>
                            </label>
                            <label className="flex items-center gap-2">
                                Group by tournament
                                <Switch
                                    checked={grouped}
                                    onCheckedChange={setGrouped}
                                    data-testid="group-toggle"
                                    aria-label="Group by tournament"
                                />
                            </label>
                        </div>

                        {groups ? (
                            groups.map((g) => (
                                <section key={g.label} className="mb-6">
                                    <h2 className="text-muted-foreground mb-2 text-[11px] font-bold tracking-widest uppercase">
                                        {g.label}
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {g.items.map((s) => (
                                            <FlowCard
                                                key={s.id}
                                                summary={s}
                                                onOpen={open}
                                                menu={
                                                    <FlowCardMenu
                                                        id={s.id}
                                                        onViewDetails={setDetailId}
                                                        onChanged={refresh}
                                                    />
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {sorted.map((m) => (
                                    <FlowCard
                                        key={m.summary.id}
                                        summary={m.summary}
                                        onOpen={open}
                                        snippet={m.snippet}
                                        menu={
                                            <FlowCardMenu
                                                id={m.summary.id}
                                                onViewDetails={setDetailId}
                                                onChanged={refresh}
                                            />
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <SettingsPanel />
            <GuideDialog />
            <FlowDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={refresh} />
        </div>
    );
}
