# Ebb — Auto-Update, Deployment & CI

How Ebb is built, deployed, and updated. The desktop release pipeline and the
in-app updater described here are implemented; the **web deployment** section
(§4) is a proposal — CI currently builds `out/` but nothing publishes it.

## 1. Shipping model: two artifacts, one codebase

Ebb ships the same `src/` (Next.js 15, `output: "export"`) as two products:

| Artifact        | What it is                              | Distribution                     | Updates                                               |
| --------------- | --------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| **Web build**   | Static export in `out/`                 | Static host (CDN), no backend    | User reloads; whatever the CDN serves is current      |
| **Desktop app** | Tauri 2 shell wrapping the same `out/`  | Signed installers, GitHub Release | In-app signed auto-updater, tournament-gated          |

Local-first invariant holds for both: no backend, no telemetry. The only network
the runtime makes beyond loading static assets is fetching `latest.json` and
update artifacts from GitHub Releases (desktop only). The web build's update
layer is fully inert (`isDesktop()` short-circuits everything — `adapter.ts:9`).

## 2. Versioning

A release is one semver living in files that must move in lockstep:

- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version` (and `src-tauri/Cargo.toml`)

The git **tag** (`vX.Y.Z`) is the trigger and the release name. The desktop
updater compares the running app version (`getCurrentVersion()`, `adapter.ts:64`)
against `manifest.version` via `isNewerVersion()` (`policy.ts:95`), which
tolerates a leading `v` and strips prerelease suffixes.

> **Gap:** version bumping is manual today (`releasing.md` step 1). A
> `scripts/bump-version.mjs` that writes all files and tags would remove the
> drift risk.

## 3. Continuous Integration (`.github/workflows/ci.yml`)

Runs on every push to `main` and every PR. Two parallel jobs:

**`web`** (ubuntu-22.04): `npm ci → npm test → npm run lint → npm run build`.
This gates all logic, including the pure update-policy tests in
`src/lib/update/*.test.ts`.

**`desktop`** (ubuntu-22.04): `npm ci → npm run build → cargo check`. The build
must run first because `generate_context!` reads `frontendDist: ../out`, which
must exist for `cargo check` to compile.

CI does not build full desktop installers (release-only) and does not deploy the
web build.

## 4. Web deployment (proposed — not yet wired)

The web build is a pure static export (`output: "export"`,
`images.unoptimized`), so any static host works.

**Option A — GitHub Pages** (recommended for v1): keeps the release story inside
GitHub, no third party, consistent with local-first. See
`.github/workflows/deploy-web.yml`.

**Option B — Vercel/Netlify**: gives per-PR preview deployments, which pairs
well with "web is the trial on-ramp." Build `npm run build`, output dir `out`.
Revisit if previews become valuable.

The web build carries no update concept — deploying it *is* the update. No
blackout gating on web: a reload is non-destructive (continuous autosave) and
the user controls when they reload.

## 5. Desktop release pipeline (`.github/workflows/release.yml`)

**Trigger:** pushing a `v*` tag. **Permission:** `contents: write`.

**Matrix** (4 builds, `fail-fast: false`): macOS arm64
(`--target aarch64-apple-darwin`), macOS x64 (`--target x86_64-apple-darwin`),
Linux x64 (ubuntu-22.04), Windows x64.

**Per-runner steps:** checkout → Node 20 → Rust stable (both Apple targets on
mac) → `swatinem/rust-cache` (`./src-tauri -> target`) → Linux webview/bundler
deps on ubuntu → `npm ci` → `tauri-apps/tauri-action@v0`.

**`tauri-action`** runs `beforeBuildCommand` (`next build` → `out/`), builds each
installer, signs the updater artifacts with the Ed25519 key, generates
`latest.json`, and uploads everything to a **draft** GitHub Release named
`Ebb vX.Y.Z`.

Key config:

- `releaseDraft: true` — release is a draft; the updater reads
  `releases/latest/download/latest.json`, and draft/prerelease releases are not
  "latest", so nothing ships until a human publishes. This is the safety valve.
- `includeUpdaterJson: true` — emits `latest.json`.
- `bundle.createUpdaterArtifacts: true` — produces signed update bundles.

**Procedure** (`releasing.md`): bump version → `git tag vX.Y.Z && git push origin
vX.Y.Z` → CI builds four targets into a draft release → review → **publish**.

## 6. Signing — two independent layers

### 6a. Updater signing (Ed25519) — mandatory, live from day one

Guarantees update *integrity*, independent of OS code signing.

- **Public key** committed in `tauri.conf.json` → `plugins.updater.pubkey`.
  Tauri verifies every artifact against it and discards anything it can't verify.
- **Private key + password** as repo secrets `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, consumed by `tauri-action`.

> ⚠️ The committed pubkey is a **development placeholder** (`releasing.md`).
> Replace it (and the matching secret) with a production key before the first
> real release. Losing the private key permanently breaks signing — clients
> reject everything thereafter.

### 6b. OS code signing — deferred but pre-wired

Earliest beta ships unsigned (macOS right-click → Open; Windows SmartScreen →
Run anyway — `manual-trust.md`). `release.yml` already declares empty env slots
for `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Populating these secrets enables
Developer ID signing + notarization with no workflow changes. A Windows
Authenticode cert is the symmetric future step.

## 7. Auto-update runtime model

Silent background download, apply only when safe, never mid-round. A pure,
Vitest-tested policy core (`src/lib/update/policy.ts`) plus a thin Tauri I/O
adapter (`adapter.ts`), wired by `useAutoUpdate` (`useAutoUpdate.ts`). The Rust
shell only loads the `updater` + `process` plugins (`lib.rs`); all policy is JS.

### 7a. Check → decide → act (`useAutoUpdate.run`)

1. Bail if not desktop or a check is already running (`running` ref guards overlap).
2. `fetchManifest()` GETs `latest.json` (`cache: "no-store"`); any
   network/parse failure returns `null` → silent `idle`, never an error popup.
3. Read current version + freshest `updateConfig` (a just-toggled setting is honored).
4. `decideUpdateAction(manifest, version, {now, config})` returns:
   - `none` — not newer → idle.
   - `download` — newer **and** eligible → download + stage → `ready`.
   - `hold` — newer but gated → silent on auto-checks; a manual check shows a
     `held` chip so the user knows one waits.
   - `critical` — newer, gated, `critical:true` → bypass modal.

UI states: `idle | checking | downloading | ready | held | critical`.

### 7b. Eligibility & tournament safety (layered)

`isUpdateEligible = !isInBlackout(now, config) && !tournamentMode`.

1. **Weekly blackout** — inclusive day-of-week range, default Fri(5)→Mon(1),
   correctly handling the week-wrap (`policy.ts:14`). Days configurable.
2. **Manual Tournament Mode** — hard pin regardless of day, for off-cadence
   events. Overrides the blackout calendar.
3. **Publisher discipline** — avoid publishing during known tournament windows
   even though the client would hold the update anyway. Defense in depth.

Downloading/staging is never gated (invisible, harmless). Only the *apply*
(relaunch into the staged version) is gated.

### 7c. Critical bypass

`shouldPromptCritical` is true only when `critical:true` **and** the update would
otherwise be held. It surfaces an explicit confirm modal
(`CriticalUpdateModal.tsx`); `installCritical()` downloads then relaunches
immediately. Never silent, never mid-session. An already-eligible critical
update just uses the normal flow.

### 7d. Background cadence & opt-in

Background checks run on mount and every 6 hours (`CHECK_INTERVAL_MS`), only when
`autoCheckEnabled` is true. Default is **opt-out**
(`DEFAULT_UPDATE_CONFIG.autoCheckEnabled = false`) — no background network until
the user enables it. Manual "Check now" always works.

### 7e. Applying

`ready` shows a restart chip (`UpdateChip.tsx`); `applyAndRestart()` calls Tauri
`relaunch()` into the staged version. Autosave plus the close guards (`lib.rs`:
`Cmd+W`/red-button neutralized, `Cmd+Q` the only deliberate exit) make a
between-rounds relaunch safe by construction.

## 8. The `latest.json` manifest

```json
{
  "version": "0.2.0",
  "pub_date": "2026-07-01T00:00:00Z",
  "notes": "…",
  "critical": false,
  "platforms": {
    "darwin-aarch64": { "signature": "<base64 ed25519>", "url": "https://…" },
    "darwin-x86_64":  { "signature": "…", "url": "…" },
    "linux-x86_64":   { "signature": "…", "url": "…" },
    "windows-x86_64": { "signature": "…", "url": "…" }
  }
}
```

`version` and `platforms` (each with string `signature` + `url`) are required;
`pub_date`, `notes`, `critical` optional (`types.ts:25`, validated by
`parseManifest`). `critical` is Ebb's extension on the stock Tauri manifest;
`tauri-action` generates everything except `critical`, set by hand on emergency
releases.

Endpoint: `https://github.com/shreerammodi/ebb/releases/latest/download/latest.json`.
The `/latest/` redirect is why draft/prerelease publishing is the release gate.

## 9. Settings & persistence

`UpdateConfig` = `{ autoCheckEnabled, blackoutStartDay, blackoutEndDay,
tournamentMode }`, persisted to `localStorage` key `df-update-settings`
(`settings.ts`), loaded merged-over-defaults and SSR-safe. Edited via
`UpdateSettings.tsx`, held in the Zustand store beside `keymapOverrides`.
Failures swallowed (best-effort, local-first).

## 10. Failure & safety properties

- Network/parse failure → silent `idle`, no error UI.
- Signature mismatch → Tauri discards the artifact; nothing stages.
- Web build → layer inert; `getCurrentVersion()` returns `0.0.0` so every real
  release reads as not-newer.
- Overlapping checks → blocked by the `running` ref.
- Bad release published during a blackout → client refuses to apply; only the
  explicit critical path overrides, and only with user consent.

## 11. Open items / hardening

1. Replace the placeholder updater pubkey before first real release (blocking).
2. Wire web deployment (§4); CI builds `out/` but nothing publishes it.
3. Automate version bump across `package.json` / `tauri.conf.json` / `Cargo.toml` + tag.
4. Enable OS code signing (secrets already slotted) to drop manual-trust.
5. Consider a `pub_date`-based minimum age (don't auto-apply a release < N hours
   old) as extra insurance against a bad publish — additive to the policy core.
