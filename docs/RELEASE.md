# Shipping Ebb

The canonical "how Ebb is built, released, and updated" doc. Start here.

Ebb ships **one codebase (`src/`) as two products** from a single version
number. This page is the overview and the release procedure; the deep-dives it
links carry the internals.

- Updater runtime model, policy, failure modes: [`desktop/ci-and-deployment.md`](desktop/ci-and-deployment.md)
- Signing keypair setup + release steps: [`desktop/releasing.md`](desktop/releasing.md)
- First-run trust on unsigned beta builds: [`desktop/manual-trust.md`](desktop/manual-trust.md)

---

## 1. Shipping model

| Product         | What it is                             | Distribution                      | How it updates                               |
| --------------- | -------------------------------------- | --------------------------------- | -------------------------------------------- |
| **Web build**   | Static export in `out/`                | Vercel CDN, no backend            | User reloads; the CDN always serves current  |
| **Desktop app** | Tauri 2 shell wrapping the same `out/` | Signed installers, GitHub Release | In-app signed auto-updater, tournament-gated |

Local-first invariant holds for all three: no backend, no telemetry. The only
network the runtime touches is fetching `latest.json` + update artifacts from
GitHub Releases, and that path is **desktop-only** and **opt-in** (`isDesktop()`
short-circuits the whole update layer on web).

## 2. Versioning

A release is one semver that must move in lockstep across four files:

- `package.json` -> `version`
- `src-tauri/tauri.conf.json` -> `version`
- `src-tauri/Cargo.toml` -> `version` (and `Cargo.lock`)

`npm run release` (= `npm version patch`) automates all of it:

1. `npm version` bumps `package.json` and creates the release commit.
2. The `version` lifecycle hook runs `scripts/sync-version.mjs`, which
   propagates the new version into the Tauri config, the Cargo crate, and
   `Cargo.lock`, then stages them into the same commit.
3. The `postversion` hook runs `git push --follow-tags`, pushing the commit and
   the `vX.Y.Z` tag.

Use `npm version minor` / `npm version major` for larger bumps; the same hooks
fire. **The pushed tag is what triggers the desktop release** (section 5).

## 3. Continuous integration (`.github/workflows/ci.yml`)

Runs on every push to `main` and every PR. Two parallel jobs, both on
`ubuntu-22.04`:

- **`web`** — `npm ci -> npm test -> npm run lint -> npm run build`. Gates all
  logic, including the pure update-policy tests in `src/lib/update/*.test.ts`.
- **`desktop`** — `npm ci -> npm run build -> cargo check`. The web build runs
  first because Tauri's `generate_context!` reads `frontendDist: ../out`, which
  must exist for `cargo check` to compile.

CI does **not** build full installers (release-only) and does **not** deploy the
web build (Vercel handles that, section 4).

## 4. Web deployment (Vercel)

The web build is a pure static export (`output: "export"`,
`images.unoptimized`) deployed via **Vercel's native Git integration** - not a
GitHub Actions workflow. No deploy tokens or secrets live in this repo.

- Push to `main` -> production deploy.
- Pull request -> isolated preview URL.

Configured once in the Vercel dashboard: framework preset **Next.js**, build
`npm run build`, output dir `out`. Deploying the web build _is_ its update -
there is no update concept on web; a reload is non-destructive (continuous
autosave) and the user controls when they reload.

## 5. Desktop release (`.github/workflows/release.yml`)

**Trigger:** pushing a `v*` tag (section 2 does this for you).

A 4-way build matrix (`fail-fast: false`) - macOS arm64, macOS x64, Linux x64,
Windows x64 - runs `tauri-apps/tauri-action`, which builds each installer, signs
the updater artifacts with the Ed25519 key, generates `latest.json`, and uploads
everything to a **draft** GitHub Release named `Ebb vX.Y.Z`.

`releaseDraft: true` is the safety valve: the updater reads
`releases/latest/download/latest.json`, and a draft is never "latest", so
**nothing ships to users until a human publishes the release.**

Full procedure and one-time signing-key setup: [`desktop/releasing.md`](desktop/releasing.md).

## 6. Signing (two independent layers)

- **Updater signing (Ed25519) - mandatory, live from day one.** Guarantees
  update integrity independent of the OS. Public key committed in
  `tauri.conf.json`; private key + password are repo secrets
  (`TAURI_SIGNING_PRIVATE_KEY`, `..._PASSWORD`). Lose the private key and you can
  never sign updates again.
- **OS code signing (Apple Developer ID / Windows Authenticode) - deferred but
  pre-wired.** `release.yml` already declares the empty `APPLE_*` secret slots;
  populate them to enable notarized signing with no workflow changes. Until
  then, beta builds are unsigned and users do a one-time trust step
  ([`desktop/manual-trust.md`](desktop/manual-trust.md)).

## 7. How users update

**Web:** reload the page. Whatever the Vercel CDN serves is current. Nothing to
install, no version to track.

**Desktop:** the in-app updater checks GitHub Releases, downloads and verifies
the signed artifact in the background, then applies it **only when safe**:

- Background checks are **opt-in** (off by default) and run on launch + every 6h
  once enabled. "Check now" in Settings always works.
- A staged update surfaces as a subtle "Update ready - Restart" chip
  (`UpdateChip`); clicking relaunches into the new version. It never nags
  mid-round.
- Applying is held during the weekly **blackout window** (default Fri->Mon) and
  whenever **Tournament Mode** is on. Downloading is never gated - only the
  restart-to-apply is.
- A release marked `critical: true` can bypass the hold, but only through an
  explicit confirm modal (`CriticalUpdateModal`), never silently.

Full state machine, eligibility layers, and failure properties:
[`desktop/ci-and-deployment.md`](desktop/ci-and-deployment.md) sections 7-10.

## 8. Beta ship checklist

Blocking before the first real release:

- [ ] **Replace the placeholder updater pubkey.** The Ed25519 key committed in
      `tauri.conf.json` is a dev placeholder. Generate a production keypair
      (`npm run tauri signer generate`), commit the new pubkey, and set
      `TAURI_SIGNING_PRIVATE_KEY` + `..._PASSWORD` as repo secrets. See
      [`desktop/releasing.md`](desktop/releasing.md).
- [ ] **Connect the repo in the Vercel dashboard** so section 4's Git
      integration is live.

Ships fine for beta, worth doing after:

- [ ] Enable OS code signing (secrets already slotted) to drop the manual-trust
      step for macOS/Windows users.
- [ ] Consider a `pub_date`-based minimum age so a bad publish can't auto-apply
      instantly.

## 9. Cutting a release (quick reference)

```bash
# From a clean main with CI green:
npm run release            # bump + sync all version files + commit + tag + push
# -> release.yml builds 4 installers into a DRAFT GitHub Release
# Review the draft on GitHub, then click Publish.
# -> the /latest/ redirect flips; desktop clients pick it up on next check.
```

For a critical fix, set `"critical": true` in the release's `latest.json` before
publishing (`tauri-action` does not set it).
