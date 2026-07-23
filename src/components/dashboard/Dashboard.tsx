"use client";

import { Gear, Question, Trash } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import KeybindingsCheatsheet from "@/components/palette/KeybindingsCheatsheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { filterFlows } from "@/lib/dashboard/filter";
import { sortSummaries, groupByTournament, type SortKey } from "@/lib/dashboard/organize";
import { listFlows, type RoundSummary } from "@/lib/persistence/flowPersistence";
import { isMacPlatform } from "@/lib/platform";
import { useFlowStore } from "@/lib/store/useFlowStore";

import FlowCard from "./FlowCard";
import FlowCardMenu from "./FlowCardMenu";
import FlowDetailDrawer from "./FlowDetailDrawer";
import ImportExportControls from "./ImportExportControls";
import { KeyTip } from "./keytips/KeyTip";
import { KeyTipsProvider } from "./keytips/KeyTipsProvider";
import NewFlowButton from "./NewFlowButton";
import { useCreateFlow } from "./useCreateFlow";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "updated", label: "Last edited" },
    { value: "date", label: "Date" },
    { value: "tournament", label: "Tournament" },
    { value: "result", label: "Result" },
];

export default function Dashboard() {
    const router = useRouter();
    const [summaries, setSummaries] = useState<RoundSummary[] | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("updated");
    const [grouped, setGrouped] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);
    const sortRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

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

    // Mod+F searches flows rather than opening the browser's find bar. The text
    // is selected too, so a second press retypes over the live query.
    // ponytail: local listener, not a keymap command - the keymap addresses a
    // flow that isn't loaded here, and nothing on this screen is rebindable.
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const mod = isMacPlatform() ? e.metaKey : e.ctrlKey;
            if (e.key !== "f" || !mod || e.altKey || e.shiftKey) return;
            e.preventDefault();
            searchRef.current?.focus();
            searchRef.current?.select();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

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
        <KeyTipsProvider>
            <div className="bg-background min-h-screen">
                <div className="border-border bg-card flex items-center gap-3 border-b px-5 py-4">
                    <Logo className="text-foreground h-5 w-auto" />
                    <KeyTip
                        id="root.search"
                        className="min-w-0 flex-1 min-[900px]:max-w-[360px]"
                        placement="bl"
                        run={() =>
                            document
                                .querySelector<HTMLInputElement>('[data-testid="dashboard-search"]')
                                ?.focus()
                        }
                    >
                        <Input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                // Escape releases the input so the bare trigger
                                // key reaches the keytips layer again.
                                if (e.key === "Escape") e.currentTarget.blur();
                            }}
                            placeholder="Search flows…"
                            className="h-9 w-full"
                            data-testid="dashboard-search"
                        />
                    </KeyTip>
                    {/* On wide screens this fills the gap and pushes the controls
                    right; below 900px it collapses so the search claims the
                    space the icon-only buttons free up. */}
                    <div className="flex-1 max-[899.98px]:hidden" />
                    <ImportExportControls onChanged={refresh} />
                    <KeyTip id="root.trash" run={() => router.push("/trash")}>
                        <Button variant="ghost" size="sm" asChild aria-label="Trash">
                            <Link href="/trash" data-testid="dashboard-trash-link">
                                <Trash className="size-4.5" />
                                <span className="max-[899.98px]:hidden">Trash</span>
                            </Link>
                        </Button>
                    </KeyTip>
                    <KeyTip
                        id="root.help"
                        run={() => useFlowStore.getState().setCheatsheetOpen(true)}
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Keyboard shortcuts"
                            data-testid="dashboard-guide"
                            onClick={() => useFlowStore.getState().setCheatsheetOpen(true)}
                        >
                            <Question className="size-4.5" />
                        </Button>
                    </KeyTip>
                    <KeyTip
                        id="root.settings"
                        run={() => useFlowStore.getState().setSettingsOpen(true)}
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Settings"
                            data-testid="dashboard-settings"
                            onClick={() => useFlowStore.getState().setSettingsOpen(true)}
                        >
                            <Gear className="size-4.5 rotate-[22.5deg]" />
                        </Button>
                    </KeyTip>
                    <KeyTip
                        id="root.new"
                        next="new"
                        run={() =>
                            document.querySelector<HTMLElement>('[data-testid="new-flow"]')?.click()
                        }
                    >
                        <NewFlowButton />
                    </KeyTip>
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
                                Flowing Public Forum or LD? Use + New flow.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="text-muted-foreground mb-4 flex items-center gap-4 text-[12.5px]">
                                <KeyTip id="root.flows" next="flows" run={() => {}}>
                                    <span data-testid="flow-count">{summaries.length} flows</span>
                                </KeyTip>
                                <div className="flex-1" />
                                <KeyTip id="flows.sort" run={() => sortRef.current?.focus()}>
                                    <div className="flex items-center gap-2">
                                        Sort
                                        <Select
                                            value={sort}
                                            // Base UI Select renders the raw value unless given a
                                            // value->label map to resolve the trigger display.
                                            items={SORT_OPTIONS}
                                            onValueChange={(value) => setSort(value as SortKey)}
                                        >
                                            <SelectTrigger
                                                ref={sortRef}
                                                size="sm"
                                                aria-label="Sort"
                                                data-testid="sort-select"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SORT_OPTIONS.map((o) => (
                                                    <SelectItem key={o.value} value={o.value}>
                                                        {o.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </KeyTip>
                                <KeyTip
                                    id="flows.group"
                                    next="flows"
                                    run={() => setGrouped((g) => !g)}
                                >
                                    <label className="flex items-center gap-2">
                                        Group by tournament
                                        <Switch
                                            checked={grouped}
                                            onCheckedChange={setGrouped}
                                            data-testid="group-toggle"
                                            aria-label="Group by tournament"
                                        />
                                    </label>
                                </KeyTip>
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
                <FlowDetailDrawer
                    id={detailId}
                    onClose={() => setDetailId(null)}
                    onChanged={refresh}
                />
            </div>
        </KeyTipsProvider>
    );
}
