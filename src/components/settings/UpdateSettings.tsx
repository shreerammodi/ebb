"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { getCurrentVersion, getSystemInfo } from "@/lib/update/adapter";
import type { UpdateUiState } from "@/lib/update/useAutoUpdate";

import { useUpdate } from "../update/UpdateProvider";
import SettingRow from "./SettingRow";

/** Rust's `std::env::consts` names, spelled the way people say them. */
const OS_LABELS: Record<string, string> = {
    macos: "macOS",
    windows: "Windows",
    linux: "Linux",
};
const ARCH_LABELS: Record<string, string> = {
    aarch64: "arm64",
    x86_64: "x86-64",
};

function statusLine(state: UpdateUiState): string | null {
    switch (state.status) {
        case "checking":
            return "Checking for updates…";
        case "downloading":
            return "Downloading update…";
        case "ready":
            return `Update ${state.manifest.version} downloaded. Install it from the chip when you're ready.`;
        case "upToDate":
            return "You're up to date.";
        case "error":
            return state.message;
        case "held":
            return `Update ${state.manifest.version} available - held while Tournament Mode is on.`;
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
    const config = useFlowStore((s) => s.updateConfig);
    const setUpdateConfig = useFlowStore((s) => s.setUpdateConfig);
    const { state, checkNow } = useUpdate();
    const [install, setInstall] = useState<{ version: string; platform: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([getCurrentVersion(), getSystemInfo()]).then(([version, system]) => {
            if (cancelled) return;
            const [os, arch] = system ?? [];
            setInstall({
                version,
                platform: os
                    ? `${OS_LABELS[os] ?? os} (${arch ? (ARCH_LABELS[arch] ?? arch) : "unknown"})`
                    : "Unknown",
            });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const busy = state.status === "checking" || state.status === "downloading";
    const message = statusLine(state);

    return (
        <div className="flex flex-col">
            <SettingRow
                title="Check for updates automatically"
                description="Downloads happen silently; installing always waits for your confirmation."
                control={
                    <Switch
                        checked={config.autoCheckEnabled}
                        onCheckedChange={(v) => setUpdateConfig({ autoCheckEnabled: v })}
                        data-testid="toggle-autoCheck"
                        aria-label="Check for updates automatically"
                    />
                }
            />

            <SettingRow
                title="Check now"
                description={
                    message ? (
                        <span data-testid="update-status">{message}</span>
                    ) : (
                        "Look for a newer version right now."
                    )
                }
                control={
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
                }
            />

            <SettingRow
                title="Tournament Mode"
                description="Pins the current version and disables automatic updates."
                control={
                    <Switch
                        checked={config.tournamentMode}
                        onCheckedChange={(v) => setUpdateConfig({ tournamentMode: v })}
                        data-testid="toggle-tournamentMode"
                        aria-label="Tournament Mode"
                    />
                }
            />

            {install && (
                <div data-testid="install-info" className="flex flex-col">
                    <SettingRow
                        title="Version"
                        control={
                            <span className="text-foreground text-[13px] tabular-nums">
                                {install.version}
                            </span>
                        }
                    />
                    <SettingRow
                        title="Platform"
                        control={
                            <span className="text-foreground text-[13px]">{install.platform}</span>
                        }
                    />
                </div>
            )}
        </div>
    );
}
