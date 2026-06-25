"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { attachAutosave, loadRound } from "@/lib/persistence/autosave";
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
        const unsubscribe = attachAutosave(useRoundStore);

        if (!id) {
            router.replace("/");
            return () => {
                mounted = false;
                unsubscribe();
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
        };
    }, [id, router]);

    if (!loaded || !round) return null;
    return <Workspace />;
}
