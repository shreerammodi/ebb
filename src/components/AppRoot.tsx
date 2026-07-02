"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { applyFlowFont } from "@/lib/fonts/applyFlowFont";
import { createTree } from "@/lib/history/tree";
import {
    attachAutosave,
    attachHistoryPersistence,
    loadRound,
    loadHistory,
} from "@/lib/persistence/autosave";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";

import Workspace from "./Workspace";

/**
 * AppRoot — boots the editor for the flow identified by ?id=.
 * Attaches autosave, loads the round, and selects an initial sheet.
 * Redirects to "/" when the id is missing, not found, or trashed.
 */
export default function AppRoot() {
    const router = useRouter();
    const params = useSearchParams();
    const id = params.get("id");
    const round = useRoundStore((s) => s.round);
    const flowFont = useRoundStore((s) => s.flowFont);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        applyFlowFont(flowFont);
    }, [flowFont]);

    useEffect(() => {
        let mounted = true;
        const unsubscribe = attachAutosave(useRoundStore, useSaveStatus.getState().report);
        const unsubscribeHistory = attachHistoryPersistence(useRoundStore);

        if (!id) {
            router.replace("/");
            return () => {
                mounted = false;
                unsubscribe();
                unsubscribeHistory();
                useSaveStatus.getState().reset();
            };
        }

        Promise.all([loadRound(id), loadHistory(id)])
            .then(([r, storedTree]) => {
                if (!mounted) return;
                if (!r || r.deletedAt != null) {
                    router.replace("/");
                    return;
                }
                const flowSheets = [...r.sheets]
                    .filter((s) => s.kind !== "cx")
                    .sort((a, b) => a.order - b.order);
                const firstSheet =
                    flowSheets[0] ?? [...r.sheets].sort((a, b) => a.order - b.order)[0];

                // Use the stored tree only if it actually belongs to this round and
                // its current snapshot matches the autosaved round (the two persist on
                // different debounces). Otherwise seed a fresh single-node tree.
                const treeCurrent = storedTree?.nodes[storedTree.currentId]?.snapshot;
                const usable =
                    storedTree !== undefined &&
                    treeCurrent?.id === r.id &&
                    treeCurrent.updatedAt === r.updatedAt;

                useRoundStore.getState().loadRound(r, {
                    activeSheetId: firstSheet?.id ?? null,
                    history: usable ? storedTree : createTree(r),
                });
            })
            .catch(() => router.replace("/"))
            .finally(() => {
                if (mounted) setLoaded(true);
            });

        return () => {
            mounted = false;
            unsubscribe();
            unsubscribeHistory();
            useSaveStatus.getState().reset();
        };
    }, [id, router]);

    if (!loaded || !round) {
        // Held frame mirroring the editor shell, so loading a round never
        // flashes a blank screen that reads as data loss.
        return (
            <div className="flex h-screen flex-col" data-testid="editor-loading">
                <div className="border-border bg-card flex h-12 flex-none items-center border-b px-4">
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex min-h-0 flex-1">
                    <div className="border-border bg-card w-[220px] shrink-0 space-y-2 border-r p-2">
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-2/3" />
                    </div>
                    <div className="flex-1 p-4">
                        <Skeleton className="h-40 w-full" />
                    </div>
                </div>
            </div>
        );
    }
    return <Workspace />;
}
