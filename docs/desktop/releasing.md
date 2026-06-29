# Releasing the desktop app

CI (`.github/workflows/release.yml`) builds, signs, and publishes desktop
installers plus the `latest.json` updater manifest whenever you push a version
tag. Before the first release you must generate the updater signing keypair and
store it as repository secrets.

## One-time: generate the Ed25519 updater keypair

> ⚠️ The public key currently committed in `src-tauri/tauri.conf.json` is a
> **placeholder** generated during development. Replace it (and the matching CI
> secret) with your own production key before shipping real updates. If you lose
> the private key or its password, you can never sign updates again — clients
> will reject anything they can't verify.

```bash
npm run tauri signer generate -- -w ~/.ebb/updater.key
```

This prints two things:

- A **private key** (written to `~/.ebb/updater.key`) and the password you set.
- A **public key** (base64), also at `~/.ebb/updater.key.pub`.

### Wire it up

1. **Public key →** paste the contents of `updater.key.pub` into
   `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Safe to commit.
2. **Private key →** add as repo secrets (Settings → Secrets and variables →
   Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` = the full contents of `~/.ebb/updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password you chose

Never commit the private key.

## Cutting a release

1. Bump the version in `src-tauri/tauri.conf.json` (and `package.json` if you
   keep them in lockstep).
2. Tag and push:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. CI builds the macOS (arm64 + x64), Windows (x64), and Linux (x64) installers,
   signs the updater artifacts, generates `latest.json`, and uploads everything
   to a **draft** GitHub Release.
4. Review the draft, then publish it. The in-app updater reads
   `releases/latest/download/latest.json`, so only published (non-draft,
   non-prerelease) releases are picked up.

## Tournament discipline

The client refuses to apply updates during the blackout window and when
Tournament Mode is on (see `src/lib/update/policy.ts`). As defense in depth,
**avoid publishing releases during known tournament windows** even though the
client guard would hold them anyway.

## OS code signing (deferred)

The release workflow already has env slots for Apple Developer ID +
notarization. To enable later, add `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, and `APPLE_TEAM_ID` as secrets — no workflow changes needed.
Until then, see `manual-trust.md` for the first-run steps users follow.
