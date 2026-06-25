"use client";

import { useRouter } from "next/navigation";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import { persistRound } from "@/lib/persistence/autosave";
import type { Role } from "@/lib/model/types";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLES: { role: Role; label: string }[] = [
    { role: "aff", label: "Aff" },
    { role: "neg", label: "Neg" },
    { role: "judge", label: "Judge" },
];

export default function NewFlowButton() {
    const router = useRouter();

    function create(role: Role) {
        const store = useRoundStore.getState();
        store.createRound({ role, format: makeFormatByKey("policy") });
        store.addSheet({
            title: role === "neg" ? "Neg" : "Aff",
            group: role === "judge" ? "aff" : role,
        });
        const round = useRoundStore.getState().round;
        if (!round) return;
        void persistRound(round);
        router.push(`/flow?id=${round.id}`);
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="new-flow">
                    + New flow
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {ROLES.map(({ role, label }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-role-${role}`}
                        onSelect={() => create(role)}
                    >
                        {label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
