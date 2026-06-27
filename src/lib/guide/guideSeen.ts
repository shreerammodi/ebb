/**
 * guideSeen — first-run flag for the Guide, stored per-device in localStorage.
 *
 * Mirrors the keymap/display settings pattern: SSR-safe, failures ignored.
 */

export const GUIDE_SEEN_KEY = "df-guide-seen";

export function loadGuideSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUIDE_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveGuideSeen(seen: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDE_SEEN_KEY, seen ? "true" : "false");
  } catch {
    // localStorage unavailable (private mode, quota) — ignore.
  }
}
