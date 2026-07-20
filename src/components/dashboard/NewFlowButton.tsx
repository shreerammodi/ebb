"use client";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role, Side } from "@/lib/model/types";

import { useCreateFlow } from "./useCreateFlow";

const ROLES: { role: Role; label: string }[] = [
    { role: "aff", label: "Aff" },
    { role: "neg", label: "Neg" },
    { role: "judge", label: "Judge" },
];

const PF_ORDERS: { firstSide: Side; label: string }[] = [
    { firstSide: "aff", label: "Aff speaks first" },
    { firstSide: "neg", label: "Neg speaks first" },
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
                <DropdownMenuLabel>Policy</DropdownMenuLabel>
                {ROLES.map(({ role, label }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-role-${role}`}
                        onSelect={() => create(role)}
                    >
                        {label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Public Forum</DropdownMenuLabel>
                {ROLES.map(({ role, label }) => (
                    <DropdownMenuSub key={role}>
                        <DropdownMenuSubTrigger data-testid={`new-flow-pf-${role}`}>
                            {label}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {PF_ORDERS.map(({ firstSide, label: orderLabel }) => (
                                <DropdownMenuItem
                                    key={firstSide}
                                    data-testid={`new-flow-pf-${role}-${firstSide}`}
                                    onSelect={() => create(role, "pf", firstSide)}
                                >
                                    {orderLabel}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Lincoln-Douglas</DropdownMenuLabel>
                {ROLES.map(({ role, label }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-ld-${role}`}
                        onSelect={() => create(role, "ld")}
                    >
                        {label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
