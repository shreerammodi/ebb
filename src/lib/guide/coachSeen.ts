/**
 * coachSeen — first-run flag for the in-editor Flow Coach, per-device.
 *
 * Mirrors {@link ./guideSeen}: SSR-safe, storage failures ignored. Set once the
 * user finishes or skips the coached first exchange so it never reappears.
 */

export const COACH_SEEN_KEY = "df-coach-seen";

export function loadCoachSeen(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(COACH_SEEN_KEY) === "true";
    } catch {
        return false;
    }
}

export function saveCoachSeen(seen: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(COACH_SEEN_KEY, seen ? "true" : "false");
    } catch {
        // localStorage unavailable (private mode, quota) — ignore.
    }
}
