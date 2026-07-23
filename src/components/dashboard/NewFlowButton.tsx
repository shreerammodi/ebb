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
import type { KeytipId } from "@/lib/dashboard/keytips";
import type { Role, Side } from "@/lib/model/types";

import { MENU_ATTR, useKeyTips } from "./keytips/KeyTipsProvider";
import { useCreateFlow } from "./useCreateFlow";

interface FlowChoice {
    role: Role;
    label: string;
    /** Keytip whose configured chord fires this item. */
    tip: KeytipId;
}

const POLICY: FlowChoice[] = [
    { role: "aff", label: "Aff", tip: "new.policyAff" },
    { role: "neg", label: "Neg", tip: "new.policyNeg" },
    { role: "judge", label: "Judge", tip: "new.policyJudge" },
];
const PF: FlowChoice[] = [
    { role: "aff", label: "Aff", tip: "new.pfAff" },
    { role: "neg", label: "Neg", tip: "new.pfNeg" },
    { role: "judge", label: "Judge", tip: "new.pfJudge" },
];
const LD: FlowChoice[] = [
    { role: "aff", label: "Aff", tip: "new.ldAff" },
    { role: "neg", label: "Neg", tip: "new.ldNeg" },
    { role: "judge", label: "Judge", tip: "new.ldJudge" },
];
/** Event headings are non-interactive, so they read as labels, not as picks. */
const EVENT_LABEL =
    "text-muted-foreground font-mono text-[9px] font-bold tracking-widest uppercase";

const PF_ORDERS: { firstSide: Side; label: string; tip: KeytipId }[] = [
    { firstSide: "aff", label: "Aff speaks first", tip: "new.pfFirstAff" },
    { firstSide: "neg", label: "Neg speaks first", tip: "new.pfFirstNeg" },
];

export default function NewFlowButton() {
    const create = useCreateFlow();
    const { mode, setMode, keytips } = useKeyTips();
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
                <DropdownMenuLabel className={EVENT_LABEL}>Policy</DropdownMenuLabel>
                {POLICY.map(({ role, label, tip }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-role-${role}`}
                        {...{ [MENU_ATTR]: keytips[tip] }}
                        onSelect={() => create(role)}
                    >
                        {label}
                        {tips && keytips[tip] && <Kbd className="ml-auto">{keytips[tip]}</Kbd>}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className={EVENT_LABEL}>Public Forum</DropdownMenuLabel>
                {PF.map(({ role, label, tip }) => (
                    <DropdownMenuSub key={role}>
                        <DropdownMenuSubTrigger
                            data-testid={`new-flow-pf-${role}`}
                            {...{ [MENU_ATTR]: keytips[tip] }}
                        >
                            {label}
                            {tips && keytips[tip] && <Kbd className="ml-auto">{keytips[tip]}</Kbd>}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {PF_ORDERS.map(({ firstSide, label: orderLabel, tip: orderTip }) => (
                                <DropdownMenuItem
                                    key={firstSide}
                                    data-testid={`new-flow-pf-${role}-${firstSide}`}
                                    {...{ [MENU_ATTR]: keytips[orderTip] }}
                                    onSelect={() => create(role, "pf", firstSide)}
                                >
                                    {orderLabel}
                                    {tips && keytips[orderTip] && (
                                        <Kbd className="ml-auto">{keytips[orderTip]}</Kbd>
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className={EVENT_LABEL}>Lincoln-Douglas</DropdownMenuLabel>
                {LD.map(({ role, label, tip }) => (
                    <DropdownMenuItem
                        key={role}
                        data-testid={`new-flow-ld-${role}`}
                        {...{ [MENU_ATTR]: keytips[tip] }}
                        onSelect={() => create(role, "ld")}
                    >
                        {label}
                        {tips && keytips[tip] && <Kbd className="ml-auto">{keytips[tip]}</Kbd>}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
