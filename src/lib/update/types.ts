/**
 * Types for the auto-update layer.
 *
 * The policy functions in `policy.ts` are pure and framework-agnostic; these
 * types describe the data they operate on (the release manifest and the user's
 * update configuration).
 */

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
 * emergency fix to surface while Tournament Mode is on.
 */
export interface UpdateManifest {
    /** Semantic version of the available release. */
    version: string;
    /** ISO-8601 publish date, if present. */
    pub_date?: string;
    /** Human-readable release notes, if present. */
    notes?: string;
    /** When true, this release may bypass Tournament Mode via an explicit prompt. */
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
    /** When true, hold the current version and never apply updates automatically. */
    tournamentMode: boolean;
}

/** Default update configuration: background checks opt-in (off), Tournament Mode off. */
export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
    autoCheckEnabled: false,
    tournamentMode: false,
};
