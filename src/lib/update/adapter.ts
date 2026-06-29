import { parseManifest } from "./policy";
import type { UpdateManifest } from "./types";

/** Static GitHub Releases manifest the updater reads. Matches tauri.conf.json. */
export const MANIFEST_URL =
    "https://github.com/shreerammodi/ebb/releases/latest/download/latest.json";

/** True when running inside the Tauri desktop shell (vs. the web build). */
export function isDesktop(): boolean {
    if (typeof window === "undefined") return false;
    return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/**
 * Fetches and parses the release manifest so the pure policy layer can decide
 * whether to act. Returns null on any failure (network error, bad status,
 * malformed manifest) — updates fail silently, never with error UI.
 */
export async function fetchManifest(): Promise<UpdateManifest | null> {
    try {
        const res = await fetch(MANIFEST_URL, { cache: "no-store" });
        if (!res.ok) return null;
        return parseManifest(await res.json());
    } catch {
        return null;
    }
}

/**
 * Performs the cryptographically-verified download + install via Tauri's
 * updater. No-op on web. Tauri verifies the Ed25519 signature internally and
 * hard-fails (discards) on mismatch.
 */
export async function downloadAndInstall(
    _onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
    if (!isDesktop()) return;
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return;
    let downloaded = 0;
    await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
            _onProgress?.(0, event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            _onProgress?.(downloaded, null);
        }
    });
}

/** Relaunches the app to apply a staged update. No-op on web. */
export async function relaunchApp(): Promise<void> {
    if (!isDesktop()) return;
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
}

/**
 * The running app version, read from the Tauri runtime. Returns "0.0.0" on web
 * or if the runtime can't be reached, which makes the policy treat any real
 * release as not-newer (so nothing happens off-desktop).
 */
export async function getCurrentVersion(): Promise<string> {
    if (!isDesktop()) return "0.0.0";
    try {
        const { getVersion } = await import("@tauri-apps/api/app");
        return await getVersion();
    } catch {
        return "0.0.0";
    }
}
