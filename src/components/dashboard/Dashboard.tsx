"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { listRounds, type RoundSummary } from "@/lib/persistence/autosave";
import {
    loadSearchIndex,
    backfillSearchIndex,
} from "@/lib/persistence/searchIndex";
import { filterFlows } from "@/lib/dashboard/filter";
import {
    sortSummaries,
    groupByTournament,
    type SortKey,
} from "@/lib/dashboard/organize";
import FlowCard from "./FlowCard";
import NewFlowButton from "./NewFlowButton";
import FlowCardMenu from "./FlowCardMenu";
import FlowDetailDrawer from "./FlowDetailDrawer";
import ImportExportControls from "./ImportExportControls";
import SettingsPanel from "@/components/SettingsPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
    const router = useRouter();
    const [summaries, setSummaries] = useState<RoundSummary[] | null>(null);
    const [index, setIndex] = useState<Map<string, string>>(new Map());
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("updated");
    const [grouped, setGrouped] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        await backfillSearchIndex();
        const [list, idx] = await Promise.all([
            listRounds(),
            loadSearchIndex(),
        ]);
        setSummaries(list);
        setIndex(idx);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const open = useCallback(
        (id: string) => router.push(`/flow?id=${id}`),
        [router],
    );

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
        () =>
            grouped ? groupByTournament(sorted.map((m) => m.summary)) : null,
        [grouped, sorted],
    );

    if (summaries === null) return null;

    const empty = summaries.length === 0;

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
                <span className="text-[15px] font-bold tracking-tight">
                    Debate<span className="text-blue-600">Flow</span>
                </span>
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
                    className="text-[13px] text-zinc-500 hover:text-zinc-800"
                    data-testid="dashboard-trash-link"
                >
                    Trash
                </Link>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Settings"
                    data-testid="dashboard-settings"
                    onClick={() =>
                        useRoundStore.getState().setSettingsOpen(true)
                    }
                >
                    <span className="text-base leading-none">⚙</span>
                </Button>
                <NewFlowButton />
            </div>

            <div className="px-5 py-5">
                {empty ? (
                    <div
                        data-testid="dashboard-empty"
                        className="mx-auto mt-20 flex max-w-sm flex-col items-center gap-4 text-center"
                    >
                        <p className="text-[15px] font-medium text-zinc-700">
                            No flows yet
                        </p>
                        <p className="text-[13px] text-zinc-500">
                            Create your first flow to get started.
                        </p>
                        <NewFlowButton />
                    </div>
                ) : (
                    <>
                        <div className="mb-4 flex items-center gap-4 text-[12.5px] text-zinc-500">
                            <span data-testid="flow-count">
                                {summaries.length} flows
                            </span>
                            <div className="flex-1" />
                            <label className="flex items-center gap-2">
                                Sort
                                <select
                                    value={sort}
                                    onChange={(e) =>
                                        setSort(e.target.value as SortKey)
                                    }
                                    data-testid="sort-select"
                                    className="rounded border border-border bg-card px-2 py-1"
                                >
                                    <option value="updated">Last edited</option>
                                    <option value="date">Date</option>
                                    <option value="tournament">
                                        Tournament
                                    </option>
                                    <option value="result">Result</option>
                                </select>
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input
                                    type="checkbox"
                                    checked={grouped}
                                    onChange={(e) =>
                                        setGrouped(e.target.checked)
                                    }
                                    data-testid="group-toggle"
                                />
                                Group by tournament
                            </label>
                        </div>

                        {groups ? (
                            groups.map((g) => (
                                <section key={g.label} className="mb-6">
                                    <h2 className="mb-2 text-[11px] font-bold tracking-widest text-zinc-400 uppercase">
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
                                                        onViewDetails={
                                                            setDetailId
                                                        }
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
            <FlowDetailDrawer
                id={detailId}
                onClose={() => setDetailId(null)}
                onChanged={refresh}
            />
        </div>
    );
}
