/**
 * guideSeen - first-run flag for the Guide, stored per-device in localStorage.
 *
 * Mirrors the keymap/display settings pattern: SSR-safe, failures ignored.
 */

import { loadBooleanFlag, saveBooleanFlag } from "./localFlag";

export const GUIDE_SEEN_KEY = "df-guide-seen";

export function loadGuideSeen(): boolean {
    return loadBooleanFlag(GUIDE_SEEN_KEY);
}

export function saveGuideSeen(seen: boolean): void {
    saveBooleanFlag(GUIDE_SEEN_KEY, seen);
}
