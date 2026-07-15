"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useFlowStore } from "@/lib/store/useFlowStore";

import {
    downloadUpdate,
    fetchManifest,
    getCurrentVersion,
    installAndRelaunch,
    isDesktop,
    type StagedUpdate,
} from "./adapter";
import { decideUpdateAction } from "./policy";
import type { UpdateManifest } from "./types";

/** How often background checks run when auto-check is enabled. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * The update lifecycle as the UI sees it.
 * - `ready`: a newer version is downloaded and verified, but the install (the
 *   rewrite of the app on disk) waits for the user to confirm via the chip.
 * - `upToDate` / `error`: manual-check feedback only; auto-checks stay silent.
 * - `held`: a newer version exists but is gated (Tournament Mode).
 *   Only surfaced for a *manual* check; auto-checks hold silently (no chip).
 * - `critical`: a critical update is gated - the bypass modal should appear.
 */
export type UpdateUiState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "downloading" }
    | { status: "ready"; manifest: UpdateManifest }
    | { status: "upToDate" }
    | { status: "error"; message: string }
    | { status: "held"; manifest: UpdateManifest }
    | { status: "critical"; manifest: UpdateManifest };

export interface AutoUpdate {
    state: UpdateUiState;
    /** Manual check. Downloads when eligible; surfaces held/critical otherwise. */
    checkNow(): Promise<void>;
    /** User-confirmed install: rewrite the app with the staged download, then relaunch. */
    installAndRestart(): Promise<void>;
    /** Explicitly confirm + install a critical update during Tournament Mode. */
    installCritical(): Promise<void>;
    /** Dismiss the critical prompt without installing. */
    dismissCritical(): void;
}

/**
 * Drives the download-silently / install-only-on-confirm update model. All
 * policy decisions come from the pure, tested `decideUpdateAction`; this hook
 * only wires that brain to Tauri I/O and the persisted config. A check never
 * touches the install on disk: it downloads at most, and the rewrite happens
 * exclusively in `installAndRestart` / `installCritical`, both user-initiated.
 * Failures surface as `error`/`upToDate` only for manual checks; auto-checks
 * stay silent. Entirely inert on the web build (no desktop runtime, so no
 * checks and no network).
 */
export function useAutoUpdate(): AutoUpdate {
    const [state, setState] = useState<UpdateUiState>({ status: "idle" });
    // Guards against overlapping checks (interval firing during a download, etc.).
    const running = useRef(false);
    // The downloaded-but-not-installed update the user has yet to confirm.
    const staged = useRef<StagedUpdate | null>(null);
    const autoCheckEnabled = useFlowStore((s) => s.updateConfig.autoCheckEnabled);

    const run = useCallback(async (manual: boolean) => {
        if (!isDesktop() || running.current) return;
        running.current = true;
        try {
            setState({ status: "checking" });
            let manifest: UpdateManifest | null;
            try {
                manifest = await fetchManifest();
            } catch {
                setState(
                    manual
                        ? { status: "error", message: "Couldn't check for updates." }
                        : { status: "idle" },
                );
                return;
            }
            if (!manifest) {
                setState(manual ? { status: "upToDate" } : { status: "idle" });
                return;
            }
            const version = await getCurrentVersion();
            // Read the freshest config so a just-flipped toggle is respected.
            const config = useFlowStore.getState().updateConfig;
            const action = decideUpdateAction(manifest, version, config);

            switch (action.kind) {
                case "download": {
                    if (staged.current?.version === manifest.version) {
                        setState({ status: "ready", manifest });
                        return;
                    }
                    setState({ status: "downloading" });
                    try {
                        const update = await downloadUpdate();
                        if (!update) {
                            setState(manual ? { status: "upToDate" } : { status: "idle" });
                            return;
                        }
                        staged.current = update;
                    } catch {
                        setState(
                            manual
                                ? { status: "error", message: "Couldn't download the update." }
                                : { status: "idle" },
                        );
                        return;
                    }
                    setState({ status: "ready", manifest });
                    return;
                }
                case "critical":
                    setState({ status: "critical", manifest: action.manifest });
                    return;
                case "hold":
                    // Auto-checks hold silently; a manual check tells the user.
                    setState(manual ? { status: "held", manifest } : { status: "idle" });
                    return;
                case "none":
                    setState({ status: "idle" });
                    return;
            }
        } finally {
            running.current = false;
        }
    }, []);

    const checkNow = useCallback(() => run(true), [run]);

    const installAndRestart = useCallback(async () => {
        const update = staged.current;
        if (!update) return;
        try {
            await installAndRelaunch(update);
        } catch {
            staged.current = null; // a half-applied install can't be retried blindly
            setState({ status: "error", message: "Couldn't install the update." });
        }
    }, []);

    const installCritical = useCallback(async () => {
        setState({ status: "downloading" });
        try {
            const update = staged.current ?? (await downloadUpdate());
            if (!update) {
                setState({ status: "idle" });
                return;
            }
            await installAndRelaunch(update);
        } catch {
            staged.current = null;
            setState({ status: "error", message: "Couldn't install the update." });
        }
    }, []);

    const dismissCritical = useCallback(() => {
        setState({ status: "idle" });
    }, []);

    // Background checks: on mount and on an interval, only when opted in.
    useEffect(() => {
        if (!isDesktop() || !autoCheckEnabled) return;
        void run(false);
        const id = window.setInterval(() => void run(false), CHECK_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [autoCheckEnabled, run]);

    return { state, checkNow, installAndRestart, installCritical, dismissCritical };
}
