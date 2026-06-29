# First-run trust steps (unsigned beta builds)

Early beta builds are not OS code-signed (Apple Developer ID / Windows cert are
deferred). Update integrity is still guaranteed by the Ed25519 updater
signature, but the operating system will warn on first launch. Here is how to
get past that once, per platform.

## macOS

Gatekeeper blocks unsigned apps on a normal double-click.

1. Move **Ebb.app** to `/Applications`.
2. **Right-click** (or Control-click) the app → **Open**.
3. In the dialog, click **Open** again.

After this one-time step, Ebb launches normally. On recent macOS you may instead
need: **System Settings → Privacy & Security → "Open Anyway"** after the first
blocked launch.

## Windows

SmartScreen warns on unsigned executables.

1. Run the installer (`Ebb_x.y.z_x64-setup.exe` or the `.msi`).
2. On the blue "Windows protected your PC" screen, click **More info**.
3. Click **Run anyway**.

## Linux

The AppImage / `.deb` are unsigned but unrestricted:

```bash
chmod +x Ebb_x.y.z_amd64.AppImage
./Ebb_x.y.z_amd64.AppImage
```

## Verifying authenticity (optional, recommended)

Each release publishes SHA256 checksums and the Ed25519 `.sig` files. To verify
a download matches what CI built:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

When OS code signing is enabled later, these manual steps disappear and the
notarized app opens on a normal double-click.
