/**
 * coachSeen - first-run flag for the in-editor Flow Coach, per-device.
 *
 * Mirrors {@link ./guideSeen}: SSR-safe, storage failures ignored. Set once the
 * user finishes or skips the coached first exchange so it never reappears.
 */

import { loadBooleanFlag, saveBooleanFlag } from "./localFlag";

export const COACH_SEEN_KEY = "df-coach-seen";

export function loadCoachSeen(): boolean {
    return loadBooleanFlag(COACH_SEEN_KEY);
}

export function saveCoachSeen(seen: boolean): void {
    saveBooleanFlag(COACH_SEEN_KEY, seen);
}
