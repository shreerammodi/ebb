"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { applyFlowFont } from "@/lib/fonts/applyFlowFont";
import { loadFlow } from "@/lib/persistence/flowPersistence";
import { attachFlowAutosave } from "@/lib/persistence/flowPersistence";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";
import { applySideColors } from "@/lib/theme/applySideColors";

import Workspace from "./Workspace";

/**
 * AppRoot - boots the editor for the flow identified by ?id=.
 * Attaches autosave, loads the round, and selects an initial sheet.
 * Redirects to "/" when the id is missing, not found, or trashed.
 */
export default function AppRoot() {
    const router = useRouter();
    const params = useSearchParams();
    const id = params.get("id");
    const round = useFlowStore((s) => s.round);
    const flowFont = useFlowStore((s) => s.flowFont);
    const affColor = useFlowStore((s) => s.affColor);
    const negColor = useFlowStore((s) => s.negColor);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        applyFlowFont(flowFont);
    }, [flowFont]);

    useEffect(() => {
        applySideColors({ aff: affColor, neg: negColor });
    }, [affColor, negColor]);

    useEffect(() => {
        let mounted = true;
        const unsubscribe = attachFlowAutosave(useFlowStore, useSaveStatus.getState().report);

        if (!id) {
            router.replace("/");
            return () => {
                mounted = false;
                unsubscribe();
                useSaveStatus.getState().reset();
            };
        }

        loadFlow(id)
            .then((r) => {
                if (!mounted) return;
                if (!r || r.deletedAt != null) {
                    router.replace("/");
                    return;
                }
                const newFlow = params.get("new") != null;
                useFlowStore.getState().loadRound(r, { newFlow });
                // Drop the one-shot marker so a later refresh loads this flow
                // as existing and restores the persisted RFD preference.
                if (newFlow) router.replace(`/flow?id=${id}`);
            })
            .catch(() => router.replace("/"))
            .finally(() => {
                if (mounted) setLoaded(true);
            });

        return () => {
            mounted = false;
            unsubscribe();
            useSaveStatus.getState().reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- id keys the load; params is read as a one-shot snapshot
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
