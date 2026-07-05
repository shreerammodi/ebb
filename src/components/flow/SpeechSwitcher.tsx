"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { POLICY_COLUMNS } from "@/lib/grid/flowColumns";
import { useFlowStore } from "@/lib/store/useFlowStore";

export default function SpeechSwitcher() {
    const switchSpeech = useFlowStore((s) => s.switchSpeech);

    return (
        <DropdownMenu>
            <Tip label="Jump to a speech across every sheet">
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="speech-switcher-btn">
                        Speech
                        <ChevronDown className="size-4 opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end">
                {POLICY_COLUMNS.map((col) => (
                    <DropdownMenuItem
                        key={col.id}
                        data-testid={`speech-${col.id}`}
                        onSelect={() => switchSpeech(col.id)}
                    >
                        {col.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
