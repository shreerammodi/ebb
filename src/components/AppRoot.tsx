"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";
import { attachAutosave, loadRound } from "@/lib/persistence/autosave";
import { Skeleton } from "@/components/ui/skeleton";
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
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let mounted = true;
        const unsubscribe = attachAutosave(
            useRoundStore,
            useSaveStatus.getState().report,
        );

        if (!id) {
            router.replace("/");
            return () => {
                mounted = false;
                unsubscribe();
                useSaveStatus.getState().reset();
            };
        }

        loadRound(id)
            .then((r) => {
                if (!mounted) return;
                if (!r || r.deletedAt != null) {
                    router.replace("/");
                    return;
                }
                const flowSheets = [...r.sheets]
                    .filter((s) => s.kind !== "cx")
                    .sort((a, b) => a.order - b.order);
                const firstSheet =
                    flowSheets[0] ??
                    [...r.sheets].sort((a, b) => a.order - b.order)[0];
                useRoundStore.setState({
                    round: r,
                    activeSheetId: firstSheet?.id ?? null,
                });
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
    }, [id, router]);

    if (!loaded || !round) {
        // Held frame mirroring the editor shell, so loading a round never
        // flashes a blank screen that reads as data loss.
        return (
            <div
                className="flex h-screen flex-col"
                data-testid="editor-loading"
            >
                <div className="flex h-12 flex-none items-center border-b border-border bg-card px-4">
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex min-h-0 flex-1">
                    <div className="w-[220px] shrink-0 space-y-2 border-r border-border bg-card p-2">
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
