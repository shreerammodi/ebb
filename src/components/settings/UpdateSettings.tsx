"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useRoundStore } from "@/lib/store/useRoundStore";

import { useUpdate } from "../update/UpdateProvider";

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
                ? `Update ${version} available — held while Tournament Mode is on.`
                : "Update available — held while Tournament Mode is on.";
        default:
            return null;
    }
}

/**
 * Desktop-only update controls: opt into background checks, run a manual check,
 * and toggle Tournament Mode. Only rendered inside the Tauri shell (the settings
 * panel gates the category on `isDesktop()`).
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
                        Pins the current version and disables automatic updates, for the duration of
                        an event.
                    </span>
                </span>
                <Switch
                    checked={config.tournamentMode}
                    onCheckedChange={(v) => setUpdateConfig({ tournamentMode: v })}
                    data-testid="toggle-tournamentMode"
                    aria-label="Tournament Mode"
                />
            </label>
        </div>
    );
}
