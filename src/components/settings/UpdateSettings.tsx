"use client";

import { ArrowDownToLine } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { getCurrentVersion, getSystemInfo } from "@/lib/update/adapter";
import type { UpdateUiState } from "@/lib/update/useAutoUpdate";
import { cn } from "@/lib/utils";

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

/** Sub-line under the install button; null when the button alone says enough. */
function statusLine(state: UpdateUiState): string | null {
    switch (state.status) {
        case "checking":
            return "Checking for updates…";
        case "downloading":
            return "Downloading the update…";
        case "ready":
            return `Update ${state.manifest.version} is ready. Installing restarts the app.`;
        case "error":
            return state.message;
        case "held":
            return `Update ${state.manifest.version} is held while Tournament Mode is on.`;
        default:
            return null;
    }
}

/** Why the install button is disabled, shown as its hover tooltip. */
function idleTooltip(state: UpdateUiState): string {
    switch (state.status) {
        case "checking":
            return "Checking for updates…";
        case "downloading":
            return "Downloading the update…";
        case "error":
            return "Couldn't check for updates.";
        case "held":
            return "Held while Tournament Mode is on.";
        default:
            return "Already on the latest version.";
    }
}

/**
 * Desktop-only update controls. The single "Install latest update" button is
 * the whole story: greyed with an "already latest" tooltip until a newer
 * version has been downloaded, then green and clickable to install + relaunch.
 * A newer version arrives either from the background poller (auto-check) or the
 * explicit "Check for updates" button. Only rendered inside the Tauri shell
 * (the settings panel gates the category on `isDesktop()`).
 */
export default function UpdateSettings() {
    const config = useFlowStore((s) => s.updateConfig);
    const setUpdateConfig = useFlowStore((s) => s.setUpdateConfig);
    const { state, checkNow, installAndRestart } = useUpdate();
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
    const ready = state.status === "ready";
    const message = statusLine(state);

    // Native `disabled` swallows pointer events, so Radix's tooltip never opens.
    // Keep the button interactive, mark it aria-disabled, and no-op the click.
    const installButton = (
        <Button
            type="button"
            size="sm"
            variant={ready ? "default" : "secondary"}
            aria-disabled={!ready}
            onClick={ready ? () => void installAndRestart() : undefined}
            data-testid="install-update"
            className={cn(
                ready
                    ? "bg-green-600 text-white hover:bg-green-600/90 dark:bg-green-600 dark:hover:bg-green-600/80"
                    : "cursor-not-allowed opacity-60",
            )}
        >
            <ArrowDownToLine />
            Install latest update
        </Button>
    );

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
                title="Software updates"
                description={
                    message ? (
                        <span data-testid="update-status">{message}</span>
                    ) : (
                        "Install a new version as soon as one is available."
                    )
                }
                control={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void checkNow()}
                            disabled={busy}
                            data-testid="check-updates"
                        >
                            {state.status === "downloading"
                                ? "Downloading…"
                                : busy
                                  ? "Checking…"
                                  : "Check for updates"}
                        </Button>
                        {ready ? (
                            installButton
                        ) : (
                            <Tip label={idleTooltip(state)}>{installButton}</Tip>
                        )}
                    </>
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
