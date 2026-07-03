/**
 * localFlag - shared SSR-safe localStorage boolean-flag helpers.
 *
 * Backs the per-device first-run flags (coachSeen, guideSeen): reads and writes
 * are guarded for SSR and storage failures (private mode, quota) are ignored.
 */

export function loadBooleanFlag(key: string): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(key) === "true";
    } catch {
        return false;
    }
}

export function saveBooleanFlag(key: string, value: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value ? "true" : "false");
    } catch {
        // localStorage unavailable (private mode, quota) - ignore.
    }
}
