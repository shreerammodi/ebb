"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { makeFlowRound } from "@/lib/model/flow";
import type { Role } from "@/lib/model/types";
import { persistFlow } from "@/lib/persistence/flowPersistence";

/**
 * useCreateFlow - single source of truth for spawning a new round.
 *
 * Creates a Policy round for the given side (CX sheet + first flow sheet),
 * persists it, and navigates into the editor. Shared by the dashboard's
 * New-flow menu and its first-run empty state so both stay in lockstep.
 */
export function useCreateFlow() {
    const router = useRouter();

    return useCallback(
        (role: Role) => {
            const round = makeFlowRound(role);
            void persistFlow(round).then(() => router.push(`/flow?id=${round.id}`));
        },
        [router],
    );
}
