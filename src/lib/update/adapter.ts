import { parseManifest } from "./policy";
import type { UpdateManifest } from "./types";

/** True when running inside the Tauri desktop shell (vs. the web build). */
export function isDesktop(): boolean {
    if (typeof window === "undefined") return false;
    return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/**
 * Fetches and parses the release manifest so the pure policy layer can decide
 * whether to act. Goes through the updater plugin (`check()` runs the fetch on
 * the Rust side) rather than a webview `fetch`: the GitHub release CDN sends no
 * CORS headers, so a cross-origin `fetch` from the `tauri://` origin is blocked
 * and every check silently fails. `check()` returns null when no newer release
 * exists; we also return null on any error — updates fail silently, never with
 * error UI. Tournament Mode gating stays in `decideUpdateAction`; `check()` only
 * compares versions, so a held update still yields a manifest here.
 */
export async function fetchManifest(): Promise<UpdateManifest | null> {
    if (!isDesktop()) return null;
    try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) return null;
        return parseManifest(update.rawJson);
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
    // ponytail: re-checks rather than threading the Update handle down from
    // fetchManifest; it's one small JSON fetch, and the handle is a Resource
    // whose lifecycle isn't worth managing across the React layer.
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

/**
 * `[os, arch]` of the running desktop binary, e.g. `["macos", "aarch64"]`.
 * Null on web or if the runtime can't be reached.
 */
export async function getSystemInfo(): Promise<[string, string] | null> {
    if (!isDesktop()) return null;
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<[string, string]>("system_info");
    } catch {
        return null;
    }
}
