<div align="center">

<img src="public/logo.svg" alt="ebb" width="180" />

# ebb

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-7c3aed.svg)](https://www.mozilla.org/MPL/2.0/)

</div>

**ebb** is a modern, keyboard-first app for flowing competitive debate rounds.
All data lives on your machine, and ebb is open source under the [Mozilla
Public License 2.0](https://www.mozilla.org/MPL/2.0/).

## Installing

Desktop builds are found on the [releases page](https://github.com/shreerammodi/ebb/releases).

### MacOS

1. Download the `.dmg` file for your Mac.
  - Apple Silicon: `*.aarch64.dmg`
  - Intel: `*.dmg`
2. Open the `*.dmg` file, and drag Ebb to your Applications folder.

On first launch, you will need to authorize the app to open since it's unsigned.

If you see:

> Can’t be opened because Apple cannot check it for malicious software

go to System Settings > Privacy & Security > scroll down > click "Open Anyway".

If instead you see:

> "Ebb.app" is damaged and can't be opened. You should move it to the Trash

this is macOS Gatekeeper quarantining the download, not actual damage. Remove
the quarantine flag in Terminal, then open the app normally:

```bash
xattr -dr com.apple.quarantine /Applications/Ebb.app
```

If you would like to download standalone versions, you can download the
`*.app.tar.gz` file for your respective architecture.

### Windows

1. Download  `*-setup.exe`
2. Run the installer

On first launch, you'll see "Windows protected your PC." Click More info > Run anyway.


### Linux

1. Download the `*.AppImage` file.
2. Make it executable and run it:

```bash
chmod +x Ebb_*.AppImage
./Ebb_*.AppImage
```


## Building From Source

Requires [Node.js](https://nodejs.org/) and npm.

```bash
npm install
npm run dev        # start the local web app at http://localhost:3000
```

### Desktop app

The desktop build (via [Tauri](https://tauri.app/)) is the preferred way to run
ebb.

```bash
npm run desktop:dev      # run the desktop app against a live dev server
npm run desktop:build    # produce a native installer in src-tauri/target
```

## Development

```bash
npm test           # run the test suite (Vitest)
npm run lint       # lint (ESLint)
npm run format     # format (oxfmt)
npm run build      # static production build to ./out
```
