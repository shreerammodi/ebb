"use client";

import { Gear, Info, Trash } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import KeybindingsCheatsheet from "@/components/palette/KeybindingsCheatsheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { filterFlows } from "@/lib/dashboard/filter";
import { sortSummaries, groupByTournament, type SortKey } from "@/lib/dashboard/organize";
import { listFlows, type RoundSummary } from "@/lib/persistence/flowPersistence";
import { useFlowStore } from "@/lib/store/useFlowStore";

import FlowCard from "./FlowCard";
import FlowCardMenu from "./FlowCardMenu";
import FlowDetailDrawer from "./FlowDetailDrawer";
import ImportExportControls from "./ImportExportControls";
import NewFlowButton from "./NewFlowButton";
import { useCreateFlow } from "./useCreateFlow";

export default function Dashboard() {
    const router = useRouter();
    const [summaries, setSummaries] = useState<RoundSummary[] | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("updated");
    const [grouped, setGrouped] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);

    const createFlow = useCreateFlow();

    const refresh = useCallback(async () => {
        setSummaries(await listFlows());
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Warm the flow route while the dashboard sits idle: prefetch its chunk and
    // execute HotGrid's module (Handsontable + registerAllModules), so the first
    // open resolves from cache instead of fetching and parsing the grid on the
    // critical path. Warms only code loading; the per-open grid render is not
    // warmable (a throwaway instance donates nothing to the real one).
    // ponytail: requestIdleCallback is absent in WKWebView (Tauri); fall back to a timer.
    useEffect(() => {
        const warm = () => {
            router.prefetch("/flow");
            void import("@/components/flow/HotGrid");
        };
        const hasIdle = typeof window.requestIdleCallback === "function";
        const handle = hasIdle ? window.requestIdleCallback(warm) : window.setTimeout(warm, 200);
        return () => {
            if (hasIdle) window.cancelIdleCallback(handle);
            else window.clearTimeout(handle);
        };
    }, [router]);

    const open = useCallback((id: string) => router.push(`/flow?id=${id}`), [router]);

    const matches = useMemo(() => filterFlows(summaries ?? [], query), [summaries, query]);
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
            <div className="bg-background min-h-screen">
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
        <div className="bg-background min-h-screen">
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
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/trash" data-testid="dashboard-trash-link">
                        <Trash className="size-4.5" />
                        Trash
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Settings"
                    data-testid="dashboard-settings"
                    onClick={() => useFlowStore.getState().setSettingsOpen(true)}
                >
                    <Gear className="size-4.5 rotate-[22.5deg]" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Keyboard shortcuts"
                    data-testid="dashboard-guide"
                    onClick={() => useFlowStore.getState().setCheatsheetOpen(true)}
                >
                    <Info className="size-4.5" />
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
                                Ebb is a keyboard-first flowing app. Everything stays on this
                                device. Pick a side to start.
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2.5">
                            <button
                                type="button"
                                data-testid="empty-start-aff"
                                onClick={() => createFlow("aff")}
                                className="border-input bg-card text-foreground hover:border-ring hover:bg-accent focus-visible:border-ring inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-medium outline-none"
                            >
                                <span className="bg-aff size-2 rounded-full" aria-hidden />
                                Aff
                            </button>
                            <button
                                type="button"
                                data-testid="empty-start-neg"
                                onClick={() => createFlow("neg")}
                                className="border-input bg-card text-foreground hover:border-ring hover:bg-accent focus-visible:border-ring inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-medium outline-none"
                            >
                                <span className="bg-neg size-2 rounded-full" aria-hidden />
                                Neg
                            </button>
                            <button
                                type="button"
                                data-testid="empty-start-judge"
                                onClick={() => createFlow("judge")}
                                className="border-input bg-card text-foreground hover:border-ring hover:bg-accent focus-visible:border-ring inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-medium outline-none"
                            >
                                <span
                                    className="bg-muted-foreground size-2 rounded-full"
                                    aria-hidden
                                />
                                Judge
                            </button>
                        </div>

                        <p className="text-muted-foreground text-[12.5px]">
                            Flowing Public Forum? Use + New flow.
                        </p>
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
                                    className="border-input bg-card text-foreground focus-visible:border-ring rounded-md border px-2 py-1 outline-none"
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

                        <LayoutGroup>
                            <AnimatePresence mode="wait" initial={false}>
                                {groups ? (
                                    <m.div
                                        key="grouped"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.1 }}
                                    >
                                        {groups.map((g) => (
                                            <section key={g.label} className="mb-6">
                                                <h2 className="text-muted-foreground mb-2 text-[11px] font-bold tracking-widest uppercase">
                                                    {g.label}
                                                </h2>
                                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                                    <AnimatePresence
                                                        mode="popLayout"
                                                        initial={false}
                                                    >
                                                        {g.items.map((s) => (
                                                            <m.div
                                                                layout
                                                                key={s.id}
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                exit={{ opacity: 0 }}
                                                            >
                                                                <FlowCard
                                                                    summary={s}
                                                                    onOpen={open}
                                                                    menu={
                                                                        <FlowCardMenu
                                                                            id={s.id}
                                                                            onViewDetails={
                                                                                setDetailId
                                                                            }
                                                                            onChanged={refresh}
                                                                        />
                                                                    }
                                                                />
                                                            </m.div>
                                                        ))}
                                                    </AnimatePresence>
                                                </div>
                                            </section>
                                        ))}
                                    </m.div>
                                ) : (
                                    <m.div
                                        key="flat"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.1 }}
                                        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                                    >
                                        <AnimatePresence mode="popLayout" initial={false}>
                                            {sorted.map((match) => (
                                                <m.div
                                                    layout
                                                    key={match.summary.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    <FlowCard
                                                        summary={match.summary}
                                                        onOpen={open}
                                                        menu={
                                                            <FlowCardMenu
                                                                id={match.summary.id}
                                                                onViewDetails={setDetailId}
                                                                onChanged={refresh}
                                                            />
                                                        }
                                                    />
                                                </m.div>
                                            ))}
                                        </AnimatePresence>
                                    </m.div>
                                )}
                            </AnimatePresence>
                        </LayoutGroup>
                    </>
                )}
            </div>

            <KeybindingsCheatsheet />
            <FlowDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={refresh} />
        </div>
    );
}
