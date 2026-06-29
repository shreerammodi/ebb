"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useRoundStore } from "@/lib/store/useRoundStore";
import type { DayOfWeek } from "@/lib/update/types";

import { useUpdate } from "../UpdateProvider";

const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

/** Short human status for the manual-check feedback line. */
function statusLine(status: string, version?: string): string | null {
    switch (status) {
        case "checking":
            return "Checking for updates…";
        case "downloading":
            return "Downloading update…";
        case "ready":
            return "Update ready — restart from the chip to apply.";
        case "held":
            return version
                ? `Update ${version} available — held until after your tournament window.`
                : "Update available — held until after your tournament window.";
        default:
            return null;
    }
}

/**
 * Desktop-only update controls: opt into background checks, run a manual check,
 * configure the tournament blackout window, and toggle Tournament Mode. Only
 * rendered inside the Tauri shell (the settings panel gates the category on
 * `isDesktop()`).
 */
export default function UpdateSettings() {
    const config = useRoundStore((s) => s.updateConfig);
    const setUpdateConfig = useRoundStore((s) => s.setUpdateConfig);
    const { state, checkNow } = useUpdate();

    const busy = state.status === "checking" || state.status === "downloading";
    const message = statusLine(
        state.status,
        state.status === "held" ? state.manifest.version : undefined,
    );

    return (
        <div className="flex flex-col gap-4">
            {/* Auto-check opt-in */}
            <label className="text-foreground flex items-center justify-between py-1.5 text-[13px]">
                <span>
                    Check for updates automatically
                    <span className="text-muted-foreground mt-0.5 block text-[12px]">
                        Downloads happen silently and only apply when it&apos;s safe.
                    </span>
                </span>
                <Switch
                    checked={config.autoCheckEnabled}
                    onCheckedChange={(v) => setUpdateConfig({ autoCheckEnabled: v })}
                    data-testid="toggle-autoCheck"
                    aria-label="Check for updates automatically"
                />
            </label>

            {/* Manual check */}
            <div className="flex items-center justify-between gap-3">
                <div className="text-foreground text-[13px]">
                    Check now
                    {message && (
                        <span
                            className="text-muted-foreground mt-0.5 block text-[12px]"
                            data-testid="update-status"
                        >
                            {message}
                        </span>
                    )}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void checkNow()}
                    disabled={busy}
                    data-testid="check-updates"
                >
                    {busy ? "Checking…" : "Check for updates"}
                </Button>
            </div>

            {/* Tournament Mode */}
            <label className="text-foreground flex items-center justify-between py-1.5 text-[13px]">
                <span>
                    Tournament Mode
                    <span className="text-muted-foreground mt-0.5 block text-[12px]">
                        Pins the current version regardless of the day, for off-cadence
                        events.
                    </span>
                </span>
                <Switch
                    checked={config.tournamentMode}
                    onCheckedChange={(v) => setUpdateConfig({ tournamentMode: v })}
                    data-testid="toggle-tournamentMode"
                    aria-label="Tournament Mode"
                />
            </label>

            {/* Blackout window */}
            <div className="flex flex-col gap-2">
                <span className="text-foreground text-[13px] font-medium">
                    Blackout window
                </span>
                <p className="text-muted-foreground -mt-1 text-[12px]">
                    Updates never apply on these days (local time).
                </p>
                <div className="flex items-center gap-2 text-[13px]">
                    <DaySelect
                        label="From"
                        value={config.blackoutStartDay}
                        onChange={(d) => setUpdateConfig({ blackoutStartDay: d })}
                        testid="blackout-start"
                    />
                    <DaySelect
                        label="through"
                        value={config.blackoutEndDay}
                        onChange={(d) => setUpdateConfig({ blackoutEndDay: d })}
                        testid="blackout-end"
                    />
                </div>
            </div>
        </div>
    );
}

function DaySelect({
    label,
    value,
    onChange,
    testid,
}: {
    label: string;
    value: DayOfWeek;
    onChange: (d: DayOfWeek) => void;
    testid: string;
}) {
    return (
        <label className="text-muted-foreground flex items-center gap-1.5">
            {label}
            <select
                value={value}
                onChange={(e) => onChange(Number(e.target.value) as DayOfWeek)}
                data-testid={testid}
                className="border-border bg-card text-foreground rounded-md border px-2 py-1 text-[13px]"
            >
                {DAY_NAMES.map((name, i) => (
                    <option key={name} value={i}>
                        {name}
                    </option>
                ))}
            </select>
        </label>
    );
}
