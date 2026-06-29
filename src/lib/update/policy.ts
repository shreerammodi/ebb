import type {
    UpdateConfig,
    UpdateEligibilityState,
    UpdateManifest,
    UpdatePlatformEntry,
} from "./types";

/**
 * Returns true if `date`'s local day-of-week falls inside the blackout window.
 *
 * The window is inclusive of both boundary days and may wrap across the week
 * boundary (the default Friday→Monday spans Fri, Sat, Sun, Mon).
 */
export function isInBlackout(date: Date, config: UpdateConfig): boolean {
    const day = date.getDay();
    const { blackoutStartDay: start, blackoutEndDay: end } = config;
    if (start <= end) {
        return day >= start && day <= end;
    }
    // Wrapping window (e.g. Fri(5)→Mon(1)): inside if on or after the start, or
    // on or before the end.
    return day >= start || day <= end;
}

/**
 * Returns true if a staged update may be applied right now: only outside the
 * blackout and only when Tournament Mode is off.
 */
export function isUpdateEligible(state: UpdateEligibilityState): boolean {
    return !isInBlackout(state.now, state.config) && !state.config.tournamentMode;
}

function isPlatformEntry(value: unknown): value is UpdatePlatformEntry {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as Record<string, unknown>;
    return typeof entry.signature === "string" && typeof entry.url === "string";
}

/**
 * Validates and normalizes a raw manifest (from `latest.json`). Throws on an
 * invalid shape. Signature verification is the updater's job, not this
 * function's — this only checks that the manifest is well-formed enough to act
 * on.
 */
export function parseManifest(json: unknown): UpdateManifest {
    if (typeof json !== "object" || json === null) {
        throw new Error("Invalid manifest: expected an object");
    }
    const raw = json as Record<string, unknown>;

    if (typeof raw.version !== "string" || raw.version.length === 0) {
        throw new Error("Invalid manifest: missing version");
    }
    if (typeof raw.platforms !== "object" || raw.platforms === null) {
        throw new Error("Invalid manifest: missing platforms");
    }

    const platforms: Record<string, UpdatePlatformEntry> = {};
    for (const [key, value] of Object.entries(raw.platforms)) {
        if (!isPlatformEntry(value)) {
            throw new Error(`Invalid manifest: malformed platform "${key}"`);
        }
        platforms[key] = { signature: value.signature, url: value.url };
    }

    const manifest: UpdateManifest = { version: raw.version, platforms };
    if (typeof raw.pub_date === "string") manifest.pub_date = raw.pub_date;
    if (typeof raw.notes === "string") manifest.notes = raw.notes;
    if (typeof raw.critical === "boolean") manifest.critical = raw.critical;

    return manifest;
}

/**
 * Returns true if a critical update should be surfaced via the explicit bypass
 * prompt. That is only the case when the update is critical AND would otherwise
 * be held (in a blackout or with Tournament Mode on). When the update is
 * already eligible, the normal "Update ready" flow applies and no modal is
 * needed.
 */
export function shouldPromptCritical(
    manifest: UpdateManifest,
    state: UpdateEligibilityState,
): boolean {
    return manifest.critical === true && !isUpdateEligible(state);
}

/** Parses a dotted version (tolerating a leading `v` and prerelease suffix). */
function versionParts(version: string): number[] {
    const core = version.replace(/^v/, "").split("-")[0] ?? "";
    return core.split(".").map((n) => Number.parseInt(n, 10) || 0);
}

/** Returns true if `candidate` is a strictly newer version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
    const a = versionParts(candidate);
    const b = versionParts(current);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const ai = a[i] ?? 0;
        const bi = b[i] ?? 0;
        if (ai !== bi) return ai > bi;
    }
    return false;
}

/** The decision the update lifecycle should act on after a manifest check. */
export type UpdateAction =
    /** No newer version is available. */
    | { kind: "none" }
    /** A newer, eligible version — download and stage it. */
    | { kind: "download" }
    /** A newer version held by the blackout / Tournament Mode (no chip). */
    | { kind: "hold" }
    /** A newer critical version held by a guard — prompt for explicit consent. */
    | { kind: "critical"; manifest: UpdateManifest };

/**
 * Pure decision for what to do given a fetched manifest, the running version,
 * and the current eligibility state. This is the brain the `useAutoUpdate` hook
 * wires to side effects; keeping it pure makes the whole policy unit-testable
 * without Tauri or timers.
 */
export function decideUpdateAction(
    manifest: UpdateManifest,
    currentVersion: string,
    state: UpdateEligibilityState,
): UpdateAction {
    if (!isNewerVersion(manifest.version, currentVersion)) {
        return { kind: "none" };
    }
    if (isUpdateEligible(state)) {
        return { kind: "download" };
    }
    if (shouldPromptCritical(manifest, state)) {
        return { kind: "critical", manifest };
    }
    return { kind: "hold" };
}
