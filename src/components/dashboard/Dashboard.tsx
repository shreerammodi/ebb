"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { listRounds, type RoundSummary } from "@/lib/persistence/autosave";
import { loadSearchIndex, backfillSearchIndex } from "@/lib/persistence/searchIndex";
import { filterFlows } from "@/lib/dashboard/filter";
import { sortSummaries, groupByTournament, type SortKey } from "@/lib/dashboard/organize";
import { Wordmark } from "@/components/brand/Logo";
import FlowCard from "./FlowCard";
import NewFlowButton from "./NewFlowButton";
import FlowCardMenu from "./FlowCardMenu";
import FlowDetailDrawer from "./FlowDetailDrawer";
import ImportExportControls from "./ImportExportControls";
import { loadGuideSeen, saveGuideSeen } from "@/lib/guide/guideSeen";
import GuideDialog from "@/components/guide/GuideDialog";
import SettingsPanel from "@/components/SettingsPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

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
    const [list, idx] = await Promise.all([listRounds(), loadSearchIndex()]);
    setSummaries(list);
    setIndex(idx);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const firstRunChecked = useRef(false);
  useEffect(() => {
    if (summaries === null || firstRunChecked.current) return;
    firstRunChecked.current = true;
    if (summaries.length === 0 && !loadGuideSeen()) {
      useRoundStore.getState().setGuideOpen(true);
      saveGuideSeen(true);
    }
  }, [summaries]);

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
        <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
          <Wordmark className="h-5 w-auto text-foreground" />
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
      <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
        <Wordmark className="h-5 w-auto text-foreground" />
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
          className="text-[13px] text-muted-foreground hover:text-foreground"
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
          <Settings className="size-4" />
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
            className="mx-auto mt-20 flex max-w-sm flex-col items-center gap-4 text-center"
          >
            <p className="text-[15px] font-medium text-foreground">No flows yet</p>
            <p className="text-[13px] text-muted-foreground">
              Create your first flow to get started.
            </p>
            <NewFlowButton />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4 text-[12.5px] text-muted-foreground">
              <span data-testid="flow-count">{summaries.length} flows</span>
              <div className="flex-1" />
              <label className="flex items-center gap-2">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  data-testid="sort-select"
                  className="rounded-md border border-input bg-card px-2 py-1 text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
                  <h2 className="mb-2 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    {g.label}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((s) => (
                      <FlowCard
                        key={s.id}
                        summary={s}
                        onOpen={open}
                        menu={
                          <FlowCardMenu id={s.id} onViewDetails={setDetailId} onChanged={refresh} />
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
