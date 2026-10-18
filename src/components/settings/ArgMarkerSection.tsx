"use client";

import { Input } from "@/components/ui/input";
import { DEFAULT_ARG_MARKER, formatArgMarker } from "@/lib/grid/argNumber";
import { useFlowStore } from "@/lib/store/useFlowStore";

import SettingRow from "./SettingRow";

/**
 * What Insert argument number writes. The marker is written exactly as typed,
 * so the preview sets each one against sample text: a trailing space or
 * separator is invisible in the field and only shows where the argument
 * starts. It uses a 2AC column because Settings has no round to ask.
 */
export default function ArgMarkerSection() {
    const argMarker = useFlowStore((s) => s.argMarker);
    const setArgMarker = useFlowStore((s) => s.setArgMarker);

    return (
        <section className="mt-4 flex flex-col" data-testid="arg-marker-section">
            <div className="mb-1 flex items-center gap-2">
                <h3 className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
                    Argument numbers
                </h3>
                <span className="bg-border/60 h-px flex-1" />
            </div>
            <SettingRow
                title="Marker text"
                description='Type %Speech% where the speech name goes and %Number% where the count goes, followed by whatever separates the marker from the argument. "%Number%. " gives 1. and 2. Without %Number%, the count goes on the end. Leave empty for the default.'
                control={
                    <Input
                        value={argMarker}
                        onChange={(e) => setArgMarker(e.target.value)}
                        placeholder={DEFAULT_ARG_MARKER}
                        aria-label="Argument marker text"
                        data-testid="arg-marker"
                        className="h-8 w-52"
                    />
                }
            >
                <div
                    className="text-muted-foreground flex flex-col text-[12px] whitespace-pre"
                    data-testid="arg-marker-preview"
                >
                    {[1, 2].map((n) => (
                        <span key={n}>
                            <span className="text-foreground">
                                {formatArgMarker(argMarker, "2AC", n)}
                            </span>
                            argument
                        </span>
                    ))}
                </div>
            </SettingRow>
        </section>
    );
}
