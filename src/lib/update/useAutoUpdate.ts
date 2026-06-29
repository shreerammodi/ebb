"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRoundStore } from "@/lib/store/useRoundStore";

import {
    downloadAndInstall,
    fetchManifest,
    getCurrentVersion,
    isDesktop,
    relaunchApp,
} from "./adapter";
import { decideUpdateAction } from "./policy";
import type { UpdateManifest } from "./types";

/** How often background checks run when auto-check is enabled. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * The update lifecycle as the UI sees it.
 * - `ready`: a staged update is waiting — show the restart chip.
 * - `held`: a newer version exists but is gated (blackout / Tournament Mode).
 *   Only surfaced for a *manual* check; auto-checks hold silently (no chip).
 * - `critical`: a critical update is gated — the bypass modal should appear.
 */
export type UpdateUiState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "downloading" }
    | { status: "ready" }
    | { status: "held"; manifest: UpdateManifest }
    | { status: "critical"; manifest: UpdateManifest };

export interface AutoUpdate {
    state: UpdateUiState;
    /** Manual check. Downloads when eligible; surfaces held/critical otherwise. */
    checkNow(): Promise<void>;
    /** Apply a staged ("ready") update by relaunching. */
    applyAndRestart(): Promise<void>;
    /** Explicitly confirm + install a critical update during a blackout. */
    installCritical(): Promise<void>;
    /** Dismiss the critical prompt without installing. */
    dismissCritical(): void;
}

/**
 * Drives the silent-download / apply-only-when-safe update model. All policy
 * decisions come from the pure, tested `decideUpdateAction`; this hook only
 * wires that brain to Tauri I/O and the persisted config. Entirely inert on the
 * web build (no desktop runtime → no checks, no network).
 */
export function useAutoUpdate(): AutoUpdate {
    const [state, setState] = useState<UpdateUiState>({ status: "idle" });
    // Guards against overlapping checks (interval firing during a download, etc.).
    const running = useRef(false);
    const autoCheckEnabled = useRoundStore((s) => s.updateConfig.autoCheckEnabled);

    const run = useCallback(async (manual: boolean) => {
        if (!isDesktop() || running.current) return;
        running.current = true;
        try {
            setState({ status: "checking" });
            const manifest = await fetchManifest();
            if (!manifest) {
                setState({ status: "idle" }); // silent on network/parse failure
                return;
            }
            const version = await getCurrentVersion();
            // Read the freshest config so a just-flipped toggle is respected.
            const config = useRoundStore.getState().updateConfig;
            const action = decideUpdateAction(manifest, version, {
                now: new Date(),
                config,
            });

            switch (action.kind) {
                case "download": {
                    setState({ status: "downloading" });
                    try {
                        await downloadAndInstall();
                    } catch {
                        setState({ status: "idle" }); // silent; nothing staged
                        return;
                    }
                    setState({ status: "ready" });
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

    const applyAndRestart = useCallback(async () => {
        await relaunchApp();
    }, []);

    const installCritical = useCallback(async () => {
        setState({ status: "downloading" });
        try {
            await downloadAndInstall();
        } catch {
            setState({ status: "idle" });
            return;
        }
        await relaunchApp();
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

    return { state, checkNow, applyAndRestart, installCritical, dismissCritical };
}
