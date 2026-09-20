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

| Product         | What it is                              | Distribution                                        | How it updates                                                    |
| --------------- | --------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| **Web build**   | Static export in `out/`                 | Vercel CDN, no backend                              | User reloads; the CDN serves the newest tag                       |
| **Desktop app** | Tauri 2 shell wrapping the same `out/`  | Installers and portable builds, GitHub Release      | In-app signed auto-updater, install on user confirm               |
| **Nightly**     | The same desktop app, built from `main` | Unsigned builds on the rolling `nightly` prerelease | Updates itself to the next tagged release, not to a newer nightly |

Both products ship from one tag, so a version number means the same thing on
both. The nightly channel sits outside that: it is the current tip of `main`,
it is not a release, and it is not something to run in a round. It carries no
updater artifacts of its own, so no nightly is ever served as an update to
anyone, and it reads the same stable manifest a tagged build does, so the
first release past it is what it offers to install.

Local-first invariant holds for all three: no backend, no telemetry, no
accounts. Two network paths exist, and the user opts into each one:

1. **Updates.** Fetching `latest.json` + update artifacts from GitHub Releases.
   **Desktop-only** and **opt-in** (`isDesktop()` short-circuits the whole
   update layer on web), and the install waits on user confirm.
2. **Shared editing.** A direct peer connection to a partner the user invited,
   behind a master switch that is off by default. Off binds no endpoint and
   contacts nothing, which is asserted by test. See
   `docs/superpowers/specs/2026-07-26-shared-editing-design.md`.

Neither path sends a flow anywhere the user did not choose.

## 2. Versioning

A release is one semver that must move in lockstep across four files, edited by
hand:

- `package.json` -> `version`
- `src-tauri/tauri.conf.json` -> `version`
- `src-tauri/Cargo.toml` -> `version`
- `src-tauri/Cargo.lock` -> refresh with `cargo update -p ebb --manifest-path src-tauri/Cargo.toml`

Then commit all four, tag `vX.Y.Z`, and push with `git push --follow-tags`.
**The pushed tag is what triggers the desktop release** (section 6).

## 3. Continuous integration (`.github/workflows/ci.yml`)

Runs on every push to `main` and every PR. Three parallel jobs, all on
`ubuntu-22.04`:

- **`web`** - `npm ci -> npm test -> npm run lint -> npm run build`. Gates all
  logic, including the pure update-policy tests in `src/lib/update/*.test.ts`.
- **`desktop`** - `npm ci -> npm run build -> cargo check -> cargo test`. The
  web build runs first because Tauri's `generate_context!` reads
  `frontendDist: ../out`, which must exist for `cargo check` to compile.
- **`advisory`** - `npm audit --audit-level=critical` and `cargo audit` against
  `src-tauri/Cargo.lock`. Both read a lock file and query a database, so the
  job runs no `npm ci` and no build, which keeps it clear of every package's
  install script. The npm threshold is critical rather than high because the
  highs open against this tree are unreachable and npm offers only major
  downgrades for them; the reasoning is in the workflow beside the step.

CI does **not** build full installers and does **not** deploy the web build.
Installers come from the nightly workflow (section 4) and the release workflow
(section 6); the web deploy is Vercel's (section 5).

## 4. Nightly builds (`.github/workflows/release-nightly.yml`)

**Trigger:** every push to `main`, or manual dispatch.

Installers for people who want to run what is on `main` without building it
themselves. The workflow gates on `npm test` + `npm run lint` against the exact
commit it is about to bundle, then builds the same 3-way matrix as a real
release and uploads into a single rolling prerelease tagged `nightly`.

Three properties keep a nightly from being mistaken for a release:

- **It does not claim a version.** Assets are named for their platform alone -
  `ebb_universal.dmg`, `ebb_amd64.deb`, `ebb_x64-setup.exe`,
  `ebb_x64-portable.exe` - because a rolling build stamped `0.7.2` is a file
  that lies about itself the moment it is downloaded. This is why the build
  does not use `tauri-action`: that action owns the upload and names assets
  from the config version. The workflow runs `tauri build` itself, strips the
  version from each bundle name, and uploads to the release id `prepare`
  produced. It refuses to upload a bundle name the version was not found in,
  so a rename upstream fails the run instead of quietly shipping
  `ebb_0.8.0_universal.dmg` off `main`. The side benefit is a download URL under
  the `nightly` tag that never changes.
- **It cannot update anyone.** `src-tauri/tauri.nightly.conf.json` overlays
  `createUpdaterArtifacts: false`, so the build emits no `.tar.gz`/`.sig` pair
  and no signing key is present to make one. There is no path by which a
  nightly artifact becomes something the updater will install. Owning the
  upload also leaves the macOS `.app` on the runner rather than tarring it into
  something shaped like an update bundle.
- **It cannot become "latest".** The release is marked prerelease, so
  `releases/latest` keeps pointing at the newest stable tag, which is the URL
  the updater reads.

Which commit a nightly came from is on the release page, not in the filenames.
GitHub publishes a sha256 beside every asset, so identity is checkable without
putting it in the name.

The previous nightly is deleted outright (`--cleanup-tag`) before the new one
is created, so a stale Windows installer never sits beside a fresh macOS one.
Like a tagged release, it is built as a draft and undrafted only once all three
platforms land. A `concurrency` group cancels an in-flight nightly when a newer
commit lands on `main`.

## 5. Web deployment (Vercel)

The web build is a pure static export (`output: "export"`,
`images.unoptimized`) deployed via **Vercel's native Git integration** - not a
GitHub Actions workflow. No deploy tokens or secrets live in this repo.

- Push to the `release` branch -> production deploy.
- Push to `main` or any pull request -> isolated preview URL.

Configured once in the Vercel dashboard: framework preset **Next.js**, build
`npm run build`, output dir `out`, and **production branch `release`**.

`release` is not a branch anyone commits to. The `publish` job fast-forwards it
to the tag it just released, so production web is always the commit the current
installers were cut from. That is what makes a version number mean the same
thing on both surfaces: a web user reporting a bug is on a version you can
name. The cost is that a fix reaches web users when you tag, not when you
merge, which is why a patch release is cheap on purpose.

A reload is still non-destructive (continuous autosave) and the user controls
when they reload; there is no update concept on web beyond the deploy.

## 6. Desktop release (`.github/workflows/release.yml`)

**Trigger:** pushing a `v*` tag (section 2 does this for you). It also accepts
a manual dispatch, which is only valid against an existing `v*` tag - a first
step fails the run otherwise, because everything downstream names the release
after the ref and a dispatch on `main` would publish a release tagged `main`.

A 3-way build matrix (`fail-fast: false`) - macOS universal, Linux x64, Windows
x64 - runs `tauri-apps/tauri-action`, which builds each installer, signs the
updater artifacts with the Ed25519 key, generates `latest.json`, and uploads
everything to a GitHub Release named `ebb vX.Y.Z`. The Windows job also uploads
the built `ebb.exe` as `ebb_X.Y.Z_x64-portable.exe`.

The workflow creates the release as a draft, and the `publish` job
(`needs: release`) publishes it after all three platforms succeed, then
fast-forwards the `release` branch to the tag so the web build follows. The
draft keeps a partly uploaded release away from clients: the updater reads
`releases/latest/download/latest.json`, and a draft is never "latest". **A tag
push reaches users on its own. If one platform fails, nothing publishes and
production web does not move.**

The release body links the changelog at the tag, not at `main`, so notes for a
shipped release do not show entries written after it.

Full procedure and one-time signing-key setup: [`desktop/releasing.md`](desktop/releasing.md).

## 7. Signing (two independent layers)

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

## 8. How users update

**Web:** reload the page. The Vercel CDN serves the newest tag. Nothing to
install; the version in the UI is a real release you can name.

**Desktop:** the in-app updater checks GitHub Releases, downloads and verifies
the signed artifact in the background, and installs it **only when the user
says so**:

- Background checks are **opt-in** (off by default) and run on launch + every 6h
  once enabled. "Check now" in Settings always works.
- A staged update surfaces as a subtle "Update ready - Restart" chip
  (`UpdateChip`); clicking installs and relaunches. It never nags mid-round and
  never applies on its own.
- Installing first writes the open flow. If that write fails, the update is
  abandoned and the round stays on screen.

There is no calendar-based gating: an explicit click is the whole safety model,
which is why Tournament Mode and the weekly blackout window were removed in
0.4.0. A user who wants no interruptions at all turns auto-update off in
Settings.

Full state machine and failure properties:
[`desktop/ci-and-deployment.md`](desktop/ci-and-deployment.md).

## 9. Beta ship checklist

Blocking before the first real release:

- [ ] **Replace the placeholder updater pubkey.** The Ed25519 key committed in
      `tauri.conf.json` is a dev placeholder. Generate a production keypair
      (`npm run tauri signer generate`), commit the new pubkey, and set
      `TAURI_SIGNING_PRIVATE_KEY` + `..._PASSWORD` as repo secrets. See
      [`desktop/releasing.md`](desktop/releasing.md).
- [ ] **Connect the repo in the Vercel dashboard** and set the production
      branch to `release`, so section 5's Git integration is live. Until that
      is set, production tracks `main` and web ships ahead of desktop.

Ships fine for beta, worth doing after:

- [ ] Enable OS code signing (secrets already slotted) to drop the manual-trust
      step for macOS/Windows users.
- [ ] Consider a `pub_date`-based minimum age so a bad publish can't auto-apply
      instantly.

## 10. Cutting a release (quick reference)

```bash
# From a clean main with CI green, set VERSION=X.Y.Z, then by hand:
# - edit `version` in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
cargo update -p ebb --manifest-path src-tauri/Cargo.toml   # refresh Cargo.lock
git commit -am "$VERSION" && git tag -s "v$VERSION" -m "v$VERSION"
git push --follow-tags
# -> release.yml builds every platform plus the portable Windows executable
#    into a draft GitHub Release, publishes it once every platform succeeds,
#    and fast-forwards `release` to the tag.
# -> the /latest/ redirect flips; desktop clients pick it up on next check.
# -> Vercel deploys `release` to production, so web lands on the same commit.
```

There is no `critical` flag. Every install waits for the user to click, so a
fix ships as an ordinary release and reaches people the next time they check.
