/**
 * Types for the auto-update layer.
 *
 * The policy functions in `policy.ts` are pure and framework-agnostic; these
 * types describe the data they operate on (the release manifest and the user's
 * update configuration).
 */

/** Days of the week as returned by `Date.prototype.getDay()` (0 = Sunday). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One platform's signed artifact in a release manifest. */
export interface UpdatePlatformEntry {
    /** Ed25519 signature of the artifact (base64). */
    signature: string;
    /** Download URL for the artifact. */
    url: string;
}

/**
 * A parsed release manifest (the `latest.json` Tauri reads). Mirrors the Tauri
 * updater manifest shape, plus an optional `critical` flag Ebb uses to allow an
 * emergency fix to surface during a tournament blackout.
 */
export interface UpdateManifest {
    /** Semantic version of the available release. */
    version: string;
    /** ISO-8601 publish date, if present. */
    pub_date?: string;
    /** Human-readable release notes, if present. */
    notes?: string;
    /** When true, this release may bypass the blackout via an explicit prompt. */
    critical?: boolean;
    /** Per-platform signed artifacts, keyed by Tauri target (e.g. `darwin-aarch64`). */
    platforms: Record<string, UpdatePlatformEntry>;
}

/**
 * User-configurable update behavior. Persisted alongside the other local
 * settings (see `settings.ts`).
 */
export interface UpdateConfig {
    /** Opt-in: when false, the app never checks in the background. */
    autoCheckEnabled: boolean;
    /** First day of the weekly blackout (inclusive). Default Friday (5). */
    blackoutStartDay: DayOfWeek;
    /** Last day of the weekly blackout (inclusive). Default Monday (1). */
    blackoutEndDay: DayOfWeek;
    /** Manual pin: when true, hold the current version regardless of day. */
    tournamentMode: boolean;
}

/** Inputs to the eligibility decision. */
export interface UpdateEligibilityState {
    /** The moment to evaluate against (local time). */
    now: Date;
    /** The user's current update configuration. */
    config: UpdateConfig;
}

/** Default update configuration: opt-out background checks, Fri–Mon blackout. */
export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
    autoCheckEnabled: false,
    blackoutStartDay: 5, // Friday
    blackoutEndDay: 1, // Monday
    tournamentMode: false,
};
