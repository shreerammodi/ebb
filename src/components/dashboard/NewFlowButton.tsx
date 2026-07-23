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
import { Kbd } from "@/components/ui/kbd";
import type { Role, Side } from "@/lib/model/types";

import { MENU_ATTR, useKeyTips } from "./keytips/KeyTipsProvider";
import { useCreateFlow } from "./useCreateFlow";

interface FlowChoice {
    role: Role;
    label: string;
    /** KeyTip chord; unique across every top-level item in this menu. */
    key: string;
}

// Distinct keys per visible item: Policy on the home cluster, PF on f/g/h, LD
// on l/k/d. The PF first-speaker submenu reuses a/n because only one submenu is
// open at a time and the overlay routes to the deepest visible match.
const POLICY: FlowChoice[] = [
    { role: "aff", label: "Aff", key: "a" },
    { role: "neg", label: "Neg", key: "n" },
    { role: "judge", label: "Judge", key: "j" },
];
const PF: FlowChoice[] = [
    { role: "aff", label: "Aff", key: "f" },
    { role: "neg", label: "Neg", key: "g" },
    { role: "judge", label: "Judge", key: "h" },
];
const LD: FlowChoice[] = [
    { role: "aff", label: "Aff", key: "l" },
    { role: "neg", label: "Neg", key: "k" },
    { role: "judge", label: "Judge", key: "d" },
];
const PF_ORDERS: { firstSide: Side; label: string; key: string }[] = [
    { firstSide: "aff", label: "Aff speaks first", key: "a" },
    { firstSide: "neg", label: "Neg speaks first", key: "n" },
];

export default function NewFlowButton() {
    const create = useCreateFlow();
    const { mode, setMode } = useKeyTips();
    const tips = mode === "new";

    // The menu stays uncontrolled (mouse still opens it standalone); opening
    // just tells the overlay to paint and route the item keys.
    return (
        <DropdownMenu onOpenChange={(open) => setMode(open ? "new" : "off")}>
            <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="new-flow">
                    + New flow
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Policy</DropdownMenuLabel>
                {POLICY.map(({ role, label, key }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-role-${role}`}
                        {...{ [MENU_ATTR]: key }}
                        onSelect={() => create(role)}
                    >
                        {label}
                        {tips && <Kbd className="ml-auto">{key}</Kbd>}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Public Forum</DropdownMenuLabel>
                {PF.map(({ role, label, key }) => (
                    <DropdownMenuSub key={role}>
                        <DropdownMenuSubTrigger
                            data-testid={`new-flow-pf-${role}`}
                            {...{ [MENU_ATTR]: key }}
                        >
                            {label}
                            {tips && <Kbd className="ml-auto">{key}</Kbd>}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {PF_ORDERS.map(({ firstSide, label: orderLabel, key: orderKey }) => (
                                <DropdownMenuItem
                                    key={firstSide}
                                    data-testid={`new-flow-pf-${role}-${firstSide}`}
                                    {...{ [MENU_ATTR]: orderKey }}
                                    onSelect={() => create(role, "pf", firstSide)}
                                >
                                    {orderLabel}
                                    {tips && <Kbd className="ml-auto">{orderKey}</Kbd>}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Lincoln-Douglas</DropdownMenuLabel>
                {LD.map(({ role, label, key }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-ld-${role}`}
                        {...{ [MENU_ATTR]: key }}
                        onSelect={() => create(role, "ld")}
                    >
                        {label}
                        {tips && <Kbd className="ml-auto">{key}</Kbd>}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
