"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import type { Role } from "@/lib/model/types";
import { persistRound } from "@/lib/persistence/autosave";
import { useRoundStore } from "@/lib/store/useRoundStore";

/**
 * useCreateFlow — single source of truth for spawning a new round.
 *
 * Creates a Policy round for the given side, seeds its first sheet, persists it,
 * and navigates into the editor. Shared by the dashboard's New-flow menu and its
 * first-run empty state so both stay in lockstep.
 */
export function useCreateFlow() {
    const router = useRouter();

    return useCallback(
        (role: Role) => {
            const store = useRoundStore.getState();
            store.createRound({ role, format: makeFormat(POLICY_PRESET) });
            store.addSheet({
                title: role === "neg" ? "Neg" : "Aff",
                group: role === "judge" ? "aff" : role,
            });
            const round = useRoundStore.getState().round;
            if (!round) return;
            void persistRound(round);
            router.push(`/flow?id=${round.id}`);
        },
        [router],
    );
}
