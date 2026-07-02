"use client";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/lib/model/types";

import { useCreateFlow } from "./useCreateFlow";

const ROLES: { role: Role; label: string }[] = [
    { role: "aff", label: "Aff" },
    { role: "neg", label: "Neg" },
    { role: "judge", label: "Judge" },
];

export default function NewFlowButton() {
    const create = useCreateFlow();

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
